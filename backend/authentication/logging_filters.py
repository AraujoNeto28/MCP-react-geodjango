from __future__ import annotations

from .request_context import get_log_username


class AddPreferredUsernameFilter:
	"""Injects `preferred_username`-like value into log records.

	Django's runserver request logging (django.server) can include custom fields
	if a filter sets attributes on the LogRecord.
	"""

	def filter(self, record):  # logging.Filter signature
		record.kc_user = get_log_username()
		return True
