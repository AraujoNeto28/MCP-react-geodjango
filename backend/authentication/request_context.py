from __future__ import annotations

import threading


_local = threading.local()


def set_log_username(username: str) -> None:
	_local.username = username or ""


def get_log_username() -> str:
	return getattr(_local, "username", "")
