from __future__ import annotations

from django.apps import AppConfig


class AuthenticationConfig(AppConfig):
	default_auto_field = "django.db.models.BigAutoField"
	name = "authentication"

	def ready(self):
		# Keep admin customization contained in this app.
		from django.conf import settings
		from django.contrib import admin

		admin.site.login_template = "admin/login_with_keycloak.html"
		admin.site.site_url = getattr(settings, "FRONTEND_URL", "http://localhost:80")
