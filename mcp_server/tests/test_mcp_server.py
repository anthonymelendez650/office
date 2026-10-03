from __future__ import annotations

import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from mcp import Client

from mcp_server.api import OfficeApiClient, OfficeApiError
from mcp_server.server import mcp


class RecordingHandler(BaseHTTPRequestHandler):
    calls: list[dict[str, object]] = []

    def do_GET(self) -> None:
        self._respond()

    def do_POST(self) -> None:
        self._respond()

    def _respond(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else b""
        self.calls.append(
            {
                "method": self.command,
                "path": self.path,
                "authorization": self.headers.get("Authorization"),
                "idempotency_key": self.headers.get("Idempotency-Key"),
                "body": json.loads(body) if body else None,
            }
        )
        if self.path == "/api/fail":
            payload = json.dumps({"detail": "Expected failure"}).encode()
            self.send_response(409)
        else:
            payload = json.dumps({"ok": True}).encode()
            self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, _format: str, *_args: object) -> None:
        return


class OfficeApiClientTests(unittest.TestCase):
    def setUp(self) -> None:
        RecordingHandler.calls = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), RecordingHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.client = OfficeApiClient(f"http://{host}:{port}/api", "secret-token")

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_bearer_headers_query_and_idempotency(self) -> None:
        self.assertEqual(self.client.request("GET", "/items", query={"archived": False}), {"ok": True})
        self.client.request(
            "POST",
            "/items",
            payload={"name": "Test"},
            idempotency_key="stable-key",
        )
        self.assertEqual(RecordingHandler.calls[0]["authorization"], "Bearer secret-token")
        self.assertEqual(RecordingHandler.calls[0]["path"], "/api/items?archived=false")
        self.assertEqual(RecordingHandler.calls[1]["idempotency_key"], "stable-key")
        self.assertEqual(RecordingHandler.calls[1]["body"], {"name": "Test"})

    def test_api_error_is_safe_and_actionable(self) -> None:
        with self.assertRaises(OfficeApiError) as caught:
            self.client.request("POST", "/fail", payload={})
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(caught.exception.detail, "Expected failure")
        self.assertNotIn("secret-token", str(caught.exception))


class FakeOfficeApi:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, object]]] = []

    def request(self, method: str, path: str, **kwargs: object) -> object:
        self.calls.append((method, path, kwargs))
        if path == "/health":
            return {"status": "ok"}
        if path == "/capabilities":
            return {"scopes": ["office.read"]}
        return {"method": method, "path": path, **kwargs}


class McpDiscoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_tools_discover_and_dispatch_in_process(self) -> None:
        fake = FakeOfficeApi()
        with patch("mcp_server.server._api", return_value=fake):
            async with Client(mcp) as client:
                listed = await client.list_tools()
                names = {tool.name for tool in listed.tools}
                self.assertGreaterEqual(len(names), 25)
                self.assertIn("create_product", names)
                self.assertIn("update_customer", names)
                self.assertIn("save_estimate", names)
                status = await client.call_tool("office_status", {})
                self.assertFalse(status.is_error)
                created = await client.call_tool(
                    "create_customer",
                    {
                        "company_id": "company-1",
                        "customer_name": "MCP Customer",
                        "change_reason": "Test MCP dispatch",
                        "idempotency_key": "dispatch-key",
                    },
                )
                self.assertFalse(created.is_error)
        create_call = next(call for call in fake.calls if call[1].endswith("/customers"))
        self.assertEqual(create_call[0], "POST")
        self.assertEqual(create_call[2]["idempotency_key"], "dispatch-key")


if __name__ == "__main__":
    unittest.main()
