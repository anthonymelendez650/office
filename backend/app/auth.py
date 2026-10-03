from __future__ import annotations

import hmac
import os
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock
from typing import Callable
from uuid import uuid4

from fastapi import HTTPException, Request

from .storage import ALL_SCOPES, MutationContext, SqliteRepository


@dataclass(frozen=True)
class AuthContext:
    actor: str
    scopes: frozenset[str]
    request_id: str
    idempotency_key: str

    def can(self, scope: str) -> bool:
        return "office.admin" in self.scopes or scope in self.scopes

    def mutation(self) -> MutationContext:
        return MutationContext(
            actor=self.actor,
            request_id=self.request_id,
            idempotency_key=self.idempotency_key,
        )


class AuthManager:
    def __init__(self, repository: SqliteRepository) -> None:
        self.repository = repository
        self.auth_required = os.getenv("OFFICE_AUTH_REQUIRED", "false").strip().casefold() in {"1", "true", "yes"}
        self.proxy_token = os.getenv("OFFICE_PROXY_TOKEN", "")
        self.rate_limit = max(int(os.getenv("OFFICE_RATE_LIMIT_PER_MINUTE", "240") or 240), 10)
        self._calls: dict[str, deque[float]] = defaultdict(deque)
        self._rate_lock = Lock()

    def _check_rate_limit(self, actor: str) -> None:
        now = time.monotonic()
        with self._rate_lock:
            calls = self._calls[actor]
            while calls and calls[0] <= now - 60:
                calls.popleft()
            if len(calls) >= self.rate_limit:
                raise HTTPException(429, "Rate limit exceeded")
            calls.append(now)

    def _verify_password(self, username: str, password: str) -> bool:
        """Validate username+password against /etc/nginx/.htpasswd-office via htpasswd -vb."""
        if not username or not password or "\x00" in username or "\x00" in password:
            return False
        import subprocess
        try:
            proc = subprocess.run(
                ["/usr/bin/htpasswd", "-vb", "/etc/nginx/.htpasswd-office", username, password],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            return proc.returncode == 0
        except (OSError, subprocess.SubprocessError):
            return False

    def _session_secret(self) -> bytes:
        token = os.getenv("OFFICE_PROXY_TOKEN", "")
        if token:
            return token.encode()
        return b"office-dev-session-secret"

    def _issue_session(self, username: str) -> str:
        import hashlib
        expiry = str(int(time.time()) + 86400)
        payload = username + "." + expiry
        sig = hmac.new(self._session_secret(), payload.encode(), hashlib.sha256).hexdigest()
        return payload + "." + sig

    def _session_user(self, raw: str) -> str:
        import hashlib
        if not raw or raw.count(".") != 2:
            return ""
        username, expiry, sig = raw.rsplit(".", 2)
        payload = username + "." + expiry
        expected = hmac.new(self._session_secret(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return ""
        try:
            if int(expiry) < int(time.time()):
                return ""
        except ValueError:
            return ""
        if not username or not self._session_valid(username):
            return ""
        return username

    def _session_valid(self, username: str) -> bool:
        try:
            with open("/etc/nginx/.htpasswd-office", "r") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or ":" not in line:
                        continue
                    user, _ = line.split(":", 1)
                    if hmac.compare_digest(user, username):
                        return True
        except OSError:
            return False
        return False

    def authenticate(self, request: Request) -> AuthContext:
        request_id = str(getattr(request.state, "request_id", "") or "").strip()
        request_id = request_id or request.headers.get("x-request-id", "").strip() or f"request-{uuid4().hex[:16]}"
        idempotency_key = request.headers.get("idempotency-key", "").strip()
        authorization = request.headers.get("authorization", "")
        if authorization.casefold().startswith("bearer "):
            raw_token = authorization[7:].strip()
            token = self.repository.authenticate_api_token(raw_token)
            if token:
                context = AuthContext(
                    actor=f"token:{token['name']}",
                    scopes=frozenset(token["scopes"]),
                    request_id=request_id,
                    idempotency_key=idempotency_key,
                )
                self._check_rate_limit(context.actor)
                return context
            raise HTTPException(
                401,
                "Invalid bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        supplied_proxy_token = request.headers.get("x-office-proxy-token", "")
        proxy_user = request.headers.get("x-office-user", "").strip()
        if self.proxy_token and proxy_user and secrets.compare_digest(supplied_proxy_token, self.proxy_token):
            scope_header = request.headers.get("x-office-scopes", "").strip()
            requested_scopes = set(scope_header.split())
            scopes = frozenset(requested_scopes & ALL_SCOPES) if scope_header else frozenset(ALL_SCOPES)
            context = AuthContext(
                actor=f"user:{proxy_user}",
                scopes=scopes,
                request_id=request_id,
                idempotency_key=idempotency_key,
            )
            self._check_rate_limit(context.actor)
            return context

        # Sign-in session (HMAC-signed cookie set by POST /api/auth/login).
        raw_session = request.cookies.get("office_session", "")
        session_user = self._session_user(raw_session) if raw_session else ""
        if session_user:
            context = AuthContext(
                actor="user:" + session_user,
                scopes=frozenset(ALL_SCOPES),
                request_id=request_id,
                idempotency_key=idempotency_key,
            )
            self._check_rate_limit(context.actor)
            return context

        if not self.auth_required:
            context = AuthContext(
                actor="local-development",
                scopes=frozenset(ALL_SCOPES),
                request_id=request_id,
                idempotency_key=idempotency_key,
            )
            self._check_rate_limit(context.actor)
            return context
        raise HTTPException(
            401,
            "Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    def require(self, *required_scopes: str) -> Callable[[Request], AuthContext]:
        def dependency(request: Request) -> AuthContext:
            context = self.authenticate(request)
            missing = [scope for scope in required_scopes if not context.can(scope)]
            if missing:
                required_scope = " ".join(missing)
                raise HTTPException(
                    403,
                    f"Missing required scope: {required_scope}",
                    headers={"WWW-Authenticate": f'Bearer scope="{required_scope}"'},
                )
            return context

        return dependency
