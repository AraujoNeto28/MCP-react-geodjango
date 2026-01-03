#!/usr/bin/env sh
set -eu

python manage.py migrate --noinput

# Optional: auto-create/update a Django superuser from env
# Set these in .env (dev only):
#   DJANGO_SUPERUSER_USERNAME=admin
#   DJANGO_SUPERUSER_PASSWORD=...
#   DJANGO_SUPERUSER_EMAIL=admin@example.com
python manage.py shell <<'PY'
import os

from django.contrib.auth import get_user_model

User = get_user_model()
username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
email = os.environ.get("DJANGO_SUPERUSER_EMAIL") or ""

if username and password:
	user, created = User.objects.get_or_create(username=username, defaults={"email": email})
	if email and not user.email:
		user.email = email
	user.is_staff = True
	user.is_superuser = True
	user.set_password(password)
	user.save()
	print(f"Superuser ensured: {username} ({'created' if created else 'updated'})")
else:
	print("Superuser env vars not set; skipping")
PY

exec python manage.py runserver 0.0.0.0:3000
