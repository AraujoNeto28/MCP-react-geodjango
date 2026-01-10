from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import requests
import jwt
from jwt import exceptions as jwt_exceptions


@dataclass
class KeycloakConfig:
	url: str
	realm: str
	client_id: str
	required_role: str
	clock_skew_seconds: int = 60

	@property
	def issuer(self) -> str:
		return f"{self.url.rstrip('/')}/realms/{self.realm}"

	@property
	def jwks_url(self) -> str:
		return f"{self.url.rstrip('/')}/realms/{self.realm}/protocol/openid-connect/certs"


@dataclass
class JwksCache:
	jwks: Optional[Dict[str, Any]] = None
	fetched_at: float = 0.0
	ttl_seconds: int = 3600

	def get(self, url: str) -> Dict[str, Any]:
		now = time.time()
		if self.jwks is not None and (now - self.fetched_at) < self.ttl_seconds:
			return self.jwks

		resp = requests.get(url, timeout=10)
		resp.raise_for_status()
		self.jwks = resp.json()
		self.fetched_at = now
		return self.jwks


_jwks_cache = JwksCache()


class TokenError(Exception):
	pass


def _alt_base_url(url: str) -> Optional[str]:
	base = (url or "").rstrip("/")
	if base.endswith("/auth"):
		return base[: -len("/auth")]
	return None


def _alt_issuer(config: KeycloakConfig) -> Optional[str]:
	alt_base = _alt_base_url(config.url)
	if not alt_base:
		return None
	return f"{alt_base}/realms/{config.realm}"


def _alt_jwks_url(config: KeycloakConfig) -> Optional[str]:
	alt_base = _alt_base_url(config.url)
	if not alt_base:
		return None
	return f"{alt_base}/realms/{config.realm}/protocol/openid-connect/certs"


def _unverified_payload(token: str) -> Dict[str, Any]:
	try:
		payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
		return payload if isinstance(payload, dict) else {}
	except Exception:
		return {}


def _extract_bearer_token(auth_header: str) -> Optional[str]:
	if not auth_header:
		return None
	parts = auth_header.split()
	if len(parts) != 2:
		return None
	if parts[0].lower() != "bearer":
		return None
	return parts[1].strip() or None


def _token_has_role(payload: Dict[str, Any], client_id: str, required_role: str) -> bool:
	realm_roles = payload.get("realm_access", {}).get("roles")
	if isinstance(realm_roles, list) and required_role in realm_roles:
		return True

	res_access = payload.get("resource_access", {})
	if isinstance(res_access, dict):
		client = res_access.get(client_id)
		if isinstance(client, dict):
			roles = client.get("roles")
			if isinstance(roles, list) and required_role in roles:
				return True

	return False


def _audience_ok(payload: Dict[str, Any], client_id: str) -> bool:
	aud = payload.get("aud")
	if isinstance(aud, str):
		if aud == client_id:
			return True
	elif isinstance(aud, list):
		if client_id in aud:
			return True

	azp = payload.get("azp")
	if isinstance(azp, str) and azp == client_id:
		return True

	return False


def validate_keycloak_jwt(config: KeycloakConfig, auth_header: str) -> Tuple[Dict[str, Any], bool]:
	token = _extract_bearer_token(auth_header)
	if not token:
		raise TokenError("Missing bearer token")

	try:
		header = jwt.get_unverified_header(token)
	except Exception as e:
		raise TokenError("Invalid token header") from e

	kid = header.get("kid")
	if not isinstance(kid, str) or not kid:
		raise TokenError("Missing kid")

	def _find_jwk(jwks: Dict[str, Any]) -> Optional[Dict[str, Any]]:
		keys = jwks.get("keys")
		if not isinstance(keys, list):
			raise TokenError("Invalid JWKS")
		return next((k for k in keys if isinstance(k, dict) and k.get("kid") == kid), None)

	jwks = _jwks_cache.get(config.jwks_url)
	jwk = _find_jwk(jwks)
	if not jwk:
		alt_jwks = _alt_jwks_url(config)
		if alt_jwks and alt_jwks != config.jwks_url:
			jwks2 = _jwks_cache.get(alt_jwks)
			jwk = _find_jwk(jwks2)
		if not jwk:
			raise TokenError("Signing key not found")

	try:
		public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
	except Exception as e:
		raise TokenError("Failed to build public key") from e

	def _decode_with_issuer(issuer: str) -> Dict[str, Any]:
		payload = jwt.decode(
			token,
			key=public_key,
			algorithms=["RS256"],
			issuer=issuer,
			options={"verify_aud": False, "verify_iat": False},
			leeway=max(0, int(getattr(config, "clock_skew_seconds", 0) or 0)),
		)
		return payload if isinstance(payload, dict) else {}

	try:
		payload = _decode_with_issuer(config.issuer)
	except jwt_exceptions.ExpiredSignatureError as e:
		raise TokenError("Token expired") from e
	except jwt_exceptions.ImmatureSignatureError as e:
		raise TokenError("Token not yet valid (nbf/iat)") from e
	except jwt_exceptions.InvalidSignatureError as e:
		raise TokenError("Invalid token signature") from e
	except jwt_exceptions.InvalidIssuerError as e:
		alt_issuer = _alt_issuer(config)
		if alt_issuer and alt_issuer != config.issuer:
			try:
				payload = _decode_with_issuer(alt_issuer)
			except Exception as e2:
				iss = _unverified_payload(token).get("iss")
				raise TokenError(
					f"Invalid issuer (iss={iss!r}). Expected {config.issuer!r} or {alt_issuer!r}"
				) from e2
			else:
				pass
		else:
			iss = _unverified_payload(token).get("iss")
			raise TokenError(f"Invalid issuer (iss={iss!r}). Expected {config.issuer!r}") from e
	except jwt_exceptions.PyJWTError as e:
		raise TokenError(f"Token validation failed: {e}") from e
	except Exception as e:
		raise TokenError(f"Token validation failed: {e}") from e

	if not _audience_ok(payload, config.client_id):
		raise TokenError("Invalid audience")

	has_role = _token_has_role(payload, config.client_id, config.required_role)
	return payload, has_role
