#!/usr/bin/env sh
set -eu

# If DB_SCHEMA is provided, ensure it exists before running migrations.
python manage.py shell <<'PY'
import os
import re

from django.db import connection

schema = (os.environ.get("DB_SCHEMA") or "").strip()
if not schema:
    print("DB_SCHEMA not set; using default schema search_path")
else:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema):
        raise SystemExit(f"Invalid DB_SCHEMA name: {schema!r}")
    with connection.cursor() as cursor:
        cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
    print(f"Schema ensured: {schema}")
PY

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

exec python manage.py runserver --nostatic 0.0.0.0:3001
