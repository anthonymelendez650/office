from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4


class OfficeApiError(RuntimeError):
    def __init__(self, status: int, detail: str) -> None:
        self.status = status
        self.detail = detail
        super().__init__(f"Office API returned {status}: {detail}")


class OfficeApiClient:
    def __init__(self, base_url: str | None = None, token: str | None = None) -> None:
        self.base_url = (base_url or os.getenv("OFFICE_API_URL") or "http://127.0.0.1:8000/api").rstrip("/")
        self.token = token if token is not None else os.getenv("OFFICE_API_TOKEN", "")
        self.timeout = max(float(os.getenv("OFFICE_API_TIMEOUT_SECONDS", "30") or 30), 1.0)
        if not self.token:
            raise RuntimeError("OFFICE_API_TOKEN is required")

    def request(
        self,
        method: str,
        path: str,
        *,
        payload: Any | None = None,
        query: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        normalized_path = path if path.startswith("/") else f"/{path}"
        parameters = {
            key: str(value).lower() if isinstance(value, bool) else value
            for key, value in (query or {}).items()
            if value is not None
        }
        url = f"{self.base_url}{normalized_path}"
        if parameters:
            url = f"{url}?{urlencode(parameters)}"
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request_id = f"mcp-{uuid4().hex[:20]}"
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "User-Agent": "silverspoon-office-mcp/1.0",
            "X-Request-ID": request_id,
        }
        if method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
            headers["Idempotency-Key"] = idempotency_key or f"mcp-{uuid4().hex}"
        request = Request(url, data=body, method=method.upper(), headers=headers)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read(16 * 1024 * 1024 + 1)
                if len(raw) > 16 * 1024 * 1024:
                    raise RuntimeError("Office API response exceeded 16 MiB")
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8"))
        except HTTPError as error:
            raw = error.read(1024 * 1024)
            try:
                parsed = json.loads(raw.decode("utf-8"))
                detail = str(parsed.get("detail") or parsed)
            except (UnicodeDecodeError, json.JSONDecodeError):
                detail = raw.decode("utf-8", errors="replace") or error.reason
            raise OfficeApiError(error.code, detail) from None
        except URLError as error:
            raise RuntimeError(f"Could not reach the Office API: {error.reason}") from None

