from __future__ import annotations

from typing import Any, Dict, Optional

from django.contrib.auth import get_user_model
from django.utils import timezone


def _split_name(full_name: str) -> tuple[str, str]:
	parts = [p for p in full_name.strip().split() if p]
	if not parts:
		return "", ""
	if len(parts) == 1:
		return parts[0], ""
	return parts[0], " ".join(parts[1:])


def upsert_user_from_keycloak(payload: Dict[str, Any]):
	"""Create/update a Django auth user for a Keycloak subject.

	This is for visibility in Django Admin (Users list). It does NOT grant admin access.
	Newly created users are not staff.
	"""

	User = get_user_model()

	username: Optional[str] = None
	for key in ("preferred_username", "username", "email", "sub"):
		v = payload.get(key)
		if isinstance(v, str) and v.strip():
			username = v.strip()
			break

	if not username:
		return None

	email = payload.get("email") if isinstance(payload.get("email"), str) else ""

	first_name = payload.get("given_name") if isinstance(payload.get("given_name"), str) else ""
	last_name = payload.get("family_name") if isinstance(payload.get("family_name"), str) else ""

	name = payload.get("name") if isinstance(payload.get("name"), str) else ""
	if name and (not first_name and not last_name):
		first_name, last_name = _split_name(name)

	user, created = User.objects.get_or_create(
		username=username,
		defaults={
			"email": email,
			"first_name": first_name,
			"last_name": last_name,
			"is_active": True,
			"is_staff": False,
			"is_superuser": False,
		},
	)

	if created:
		try:
			user.set_unusable_password()
		except Exception:
			pass

	changed_fields: list[str] = []
	if email and getattr(user, "email", "") != email:
		user.email = email
		changed_fields.append("email")

	if first_name and getattr(user, "first_name", "") != first_name:
		user.first_name = first_name
		changed_fields.append("first_name")

	if last_name and getattr(user, "last_name", "") != last_name:
		user.last_name = last_name
		changed_fields.append("last_name")

	if hasattr(user, "last_login"):
		try:
			user.last_login = timezone.now()
			changed_fields.append("last_login")
		except Exception:
			pass

	if created:
		user.save()
	elif changed_fields:
		user.save(update_fields=list(set(changed_fields)))

	return user
