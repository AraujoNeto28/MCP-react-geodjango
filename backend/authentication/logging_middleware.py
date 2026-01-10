from __future__ import annotations

from django.utils.deprecation import MiddlewareMixin

from .request_context import set_log_username


class RequestLogContextMiddleware(MiddlewareMixin):
	"""Stores a per-request username for log formatting.

	We intentionally DO NOT clear this in process_response because Django's
	django.server access log is emitted after the response is returned from the
	middleware stack. We instead reset at the start of each request.
	"""

	def process_request(self, request):
		# Default empty (covers non-authenticated requests)
		username = ""

		# Normal Django session auth (admin login, including Keycloak admin flow)
		user = getattr(request, "user", None)
		if getattr(user, "is_authenticated", False):
			username = getattr(user, "get_username", lambda: "")() or getattr(user, "username", "") or ""

		# Keycloak API auth (set earlier by KeycloakRequiredMiddleware)
		if not username:
			payload = getattr(request, "keycloak", None)
			if isinstance(payload, dict):
				v = payload.get("preferred_username")
				if isinstance(v, str) and v.strip():
					username = v.strip()

		# Frontend may send this header for logging even when auth fails (401).
		if not username:
			v = request.META.get("HTTP_X_PREFERRED_USERNAME")
			if isinstance(v, str) and v.strip():
				username = v.strip()

		set_log_username(username)
		return None
