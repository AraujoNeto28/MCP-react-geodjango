from __future__ import annotations

from django.conf import settings
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

from .keycloak_auth import KeycloakConfig, TokenError, validate_keycloak_jwt
from .user_sync import upsert_user_from_keycloak


class KeycloakRequiredMiddleware(MiddlewareMixin):
	"""Require Keycloak Bearer token + role for all /api/* endpoints.

	- 401 if missing/invalid token
	- 403 if token valid but role missing

	Frontend is responsible for redirecting to /access-denied.html.
	"""

	def __init__(self, get_response=None):
		super().__init__(get_response)

		# Keycloak values are hardcoded in settings.py (per requirement).
		self.config = KeycloakConfig(
			url=getattr(settings, "KEYCLOAK_URL", "https://sso-pmpa-hom.procempa.com.br/auth"),
			realm=getattr(settings, "KEYCLOAK_REALM", "pmpa"),
			client_id=getattr(settings, "KEYCLOAK_CLIENT_ID", "geoteste"),
			required_role=getattr(settings, "REQUIRED_ROLE", "mcp"),
			clock_skew_seconds=int(getattr(settings, "KEYCLOAK_CLOCK_SKEW_SECONDS", 60)),
		)

	def process_request(self, request):
		path = request.path or ""

		if request.method == "OPTIONS":
			return None

		if not path.startswith("/api/"):
			return None

		# Allow health checks without auth.
		if path == "/api/health/":
			return None

		# Allow Django Admin staff sessions to use internal API endpoints
		# (e.g. /api/tree-builder/) without requiring a Bearer token.
		user = getattr(request, "user", None)
		if getattr(user, "is_authenticated", False) and getattr(user, "is_staff", False):
			return None

		auth = request.META.get("HTTP_AUTHORIZATION", "")
		try:
			payload, has_role = validate_keycloak_jwt(self.config, auth)
		except TokenError as e:
			return JsonResponse({"detail": "Unauthorized", "error": str(e)}, status=401)

		if not has_role:
			return JsonResponse({"detail": "Forbidden", "error": "Missing required role"}, status=403)

		# Auto-provision Django user for admin visibility.
		# Fail-open: auth is still based on Keycloak token, not DB.
		try:
			upsert_user_from_keycloak(payload)
		except Exception:
			pass

		# Attach for potential downstream usage
		request.keycloak = payload
		return None
