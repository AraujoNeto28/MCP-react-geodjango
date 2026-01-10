from __future__ import annotations

import base64
import hashlib
import secrets
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.contrib.auth import login, logout
from django.http import HttpResponseBadRequest, HttpResponseForbidden
from django.shortcuts import redirect
from django.urls import reverse

from .keycloak_auth import KeycloakConfig, TokenError, validate_keycloak_jwt
from .user_sync import upsert_user_from_keycloak


def _b64url(data: bytes) -> str:
	return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _build_config() -> KeycloakConfig:
	return KeycloakConfig(
		url=getattr(settings, "KEYCLOAK_URL", "https://sso-pmpa-hom.procempa.com.br/auth"),
		realm=getattr(settings, "KEYCLOAK_REALM", "pmpa"),
		client_id=getattr(settings, "KEYCLOAK_CLIENT_ID", "geoteste"),
		required_role=getattr(settings, "REQUIRED_ROLE", "mcp"),
		clock_skew_seconds=int(getattr(settings, "KEYCLOAK_CLOCK_SKEW_SECONDS", 60)),
	)


def _auth_endpoint(config: KeycloakConfig) -> str:
	return f"{config.issuer}/protocol/openid-connect/auth"


def _token_endpoint(config: KeycloakConfig) -> str:
	return f"{config.issuer}/protocol/openid-connect/token"


def admin_keycloak_login(request):
	"""Start Keycloak login for Django Admin (PKCE)."""

	config = _build_config()

	if request.user.is_authenticated and getattr(request.user, "is_staff", False):
		return redirect("/admin/")

	state = secrets.token_urlsafe(32)
	nonce = secrets.token_urlsafe(32)
	verifier = secrets.token_urlsafe(64)

	challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())

	request.session["kc_admin_state"] = state
	request.session["kc_admin_nonce"] = nonce
	request.session["kc_admin_verifier"] = verifier

	next_url = request.GET.get("next")
	if isinstance(next_url, str) and next_url.startswith("/"):
		request.session["kc_admin_next"] = next_url

	redirect_uri = request.build_absolute_uri(reverse("admin_keycloak_callback"))

	params = {
		"client_id": config.client_id,
		"redirect_uri": redirect_uri,
		"response_type": "code",
		"scope": "openid profile email",
		"state": state,
		"nonce": nonce,
		"code_challenge": challenge,
		"code_challenge_method": "S256",
	}

	return redirect(f"{_auth_endpoint(config)}?{urlencode(params)}")


def admin_keycloak_callback(request):
	"""Handle Keycloak callback, create/update user, and login to Django session."""

	config = _build_config()

	err = request.GET.get("error")
	if isinstance(err, str) and err:
		desc = request.GET.get("error_description")
		if isinstance(desc, str) and desc:
			return HttpResponseBadRequest(f"Keycloak error: {err} ({desc})")
		return HttpResponseBadRequest(f"Keycloak error: {err}")

	code = request.GET.get("code")
	state = request.GET.get("state")

	expected_state = request.session.get("kc_admin_state")
	verifier = request.session.get("kc_admin_verifier")

	if not code or not state:
		return HttpResponseBadRequest("Missing code/state")

	if not expected_state or state != expected_state:
		return HttpResponseBadRequest("Invalid state")

	if not verifier:
		return HttpResponseBadRequest("Missing PKCE verifier")

	redirect_uri = request.build_absolute_uri(reverse("admin_keycloak_callback"))

	token_data = {
		"grant_type": "authorization_code",
		"client_id": config.client_id,
		"code": code,
		"redirect_uri": redirect_uri,
		"code_verifier": verifier,
	}
	client_secret = getattr(settings, "KEYCLOAK_CLIENT_SECRET", None)
	if isinstance(client_secret, str) and client_secret.strip():
		token_data["client_secret"] = client_secret.strip()

	try:
		token_resp = requests.post(_token_endpoint(config), data=token_data, timeout=10)
		token_resp.raise_for_status()
	except Exception as e:
		return HttpResponseBadRequest(f"Token exchange failed: {e}")

	token_json = token_resp.json() if token_resp.content else {}
	access_token = token_json.get("access_token")

	if not isinstance(access_token, str) or not access_token:
		return HttpResponseBadRequest("Missing access_token")

	try:
		payload, has_role = validate_keycloak_jwt(config, f"Bearer {access_token}")
	except TokenError as e:
		return HttpResponseBadRequest(f"Token validation failed: {e}")

	if not has_role:
		logout(request)
		return HttpResponseForbidden("Você não tem a role necessária (mcp) para acessar.")

	user = upsert_user_from_keycloak(payload)
	if not user:
		return HttpResponseBadRequest("Failed to map Keycloak user")

	for k in ("kc_admin_state", "kc_admin_nonce", "kc_admin_verifier"):
		try:
			del request.session[k]
		except KeyError:
			pass

	if not getattr(user, "is_staff", False):
		logout(request)
		return HttpResponseForbidden("Você não tem permissão (is_staff) para acessar o Django Admin.")

	login(request, user, backend="django.contrib.auth.backends.ModelBackend")

	next_url = request.session.pop("kc_admin_next", None)
	if isinstance(next_url, str) and next_url.startswith("/"):
		return redirect(next_url)

	return redirect("/admin/")
