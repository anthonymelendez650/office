from __future__ import annotations

import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.storage import MutationContext, SqliteRepository


class SqliteApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.repository = SqliteRepository(Path(self.temporary.name))
        self.company_id = self.repository.store()["companies"][0]["company_id"]
        self.environment = patch.dict(
            os.environ,
            {"OFFICE_AUTH_REQUIRED": "false", "OFFICE_PROXY_TOKEN": ""},
            clear=False,
        )
        self.environment.start()
        self.client = TestClient(create_app(self.repository))

    def tearDown(self) -> None:
        self.client.close()
        self.environment.stop()
        self.temporary.cleanup()

    @staticmethod
    def mutation_headers(key: str) -> dict[str, str]:
        return {"Idempotency-Key": key, "X-Request-ID": f"test-{key}"}

    def test_idempotent_customer_write_versions_and_audit(self) -> None:
        path = f"/api/companies/{self.company_id}/customers"
        payload = {
            "customer_name": "MCP Customer",
            "customer_email": "customer@example.com",
            "internal_notes": "private",
            "change_reason": "Created from test",
        }
        missing_key = self.client.post(path, json=payload)
        self.assertEqual(missing_key.status_code, 400)

        first = self.client.post(path, json=payload, headers=self.mutation_headers("create-customer"))
        replay = self.client.post(path, json=payload, headers=self.mutation_headers("create-customer"))
        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 201)
        self.assertEqual(first.json(), replay.json())
        customer = first.json()
        self.assertEqual(customer["version"], 1)

        collision = self.client.post(
            path,
            json={**payload, "customer_name": "Different"},
            headers=self.mutation_headers("create-customer"),
        )
        self.assertEqual(collision.status_code, 409)
        self.assertEqual(len(self.repository.list_customers(self.company_id)), 1)

        update_path = f"{path}/{customer['customer_id']}"
        updated = self.client.patch(
            update_path,
            json={
                "expected_version": 1,
                "change_reason": "Corrected organization",
                "organization": "MCP Events",
            },
            headers=self.mutation_headers("update-customer"),
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["version"], 2)
        stale = self.client.patch(
            update_path,
            json={
                "expected_version": 1,
                "change_reason": "Stale edit",
                "organization": "Old value",
            },
            headers=self.mutation_headers("stale-customer"),
        )
        self.assertEqual(stale.status_code, 409)

        revisions = self.client.get(f"{update_path}/revisions")
        self.assertEqual([item["version"] for item in revisions.json()], [2, 1])
        audit = self.client.get("/api/admin/audit", params={"entity_id": customer["customer_id"]})
        self.assertEqual(audit.status_code, 200)
        self.assertEqual(len(audit.json()), 2)
        self.assertTrue(all(item["actor"] == "local-development" for item in audit.json()))
        self.assertTrue(all(item["request_id"].startswith("test-") for item in audit.json()))

    def test_scope_enforcement_and_field_redaction(self) -> None:
        invalid = self.client.get("/api/bootstrap", headers={"Authorization": "Bearer invalid"})
        self.assertEqual(invalid.status_code, 401)
        customer = self.repository.create_customer(
            self.company_id,
            {
                "customer_name": "Sensitive Customer",
                "customer_email": "sensitive@example.com",
                "customer_phone": "555-0100",
                "billing_address": "1 Private Way",
                "internal_notes": "Internal only",
            },
            "Fixture",
            MutationContext(actor="test-fixture"),
        )
        _record, token = self.repository.create_api_token("read-only-test", {"office.read"})
        _mcp_record, mcp_token = self.repository.create_api_token(
            "mcp-connect-test", {"office.mcp.connect"}
        )
        with patch.dict(os.environ, {"OFFICE_AUTH_REQUIRED": "true", "OFFICE_PROXY_TOKEN": ""}, clear=False):
            with TestClient(create_app(self.repository)) as client:
                headers = {"Authorization": f"Bearer {token}"}
                bootstrap = client.get("/api/bootstrap", headers=headers)
                self.assertEqual(bootstrap.status_code, 200)
                returned = next(
                    item
                    for item in bootstrap.json()["store"]["companies"][0]["customers"]
                    if item["customer_id"] == customer["customer_id"]
                )
                self.assertEqual(returned["customer_email"], "")
                self.assertEqual(returned["customer_phone"], "")
                self.assertEqual(returned["billing_address"], "")
                self.assertEqual(returned["internal_notes"], "")

                forbidden = client.post(
                    f"/api/companies/{self.company_id}/customers",
                    json={"customer_name": "Denied", "change_reason": "Should fail"},
                    headers={**headers, "Idempotency-Key": "denied-write"},
                )
                self.assertEqual(forbidden.status_code, 403)
                self.assertEqual(client.get("/api/bootstrap").status_code, 401)
                self.assertEqual(client.get("/api/auth/mcp", headers=headers).status_code, 403)

                mcp_headers = {"Authorization": f"Bearer {mcp_token}"}
                self.assertEqual(client.get("/api/auth/mcp", headers=mcp_headers).status_code, 204)
                self.assertEqual(client.get("/api/capabilities", headers=mcp_headers).status_code, 403)

    def test_browser_import_preview_safe_merge_and_preserve_copy(self) -> None:
        state = {
            "store": {
                "selected_company": "Browser Workspace",
                "companies": [
                    {
                        "company_id": "browser-company-1",
                        "business_name": "Browser Workspace",
                        "business_email": "browser@example.com",
                        "products": [
                            {
                                "product_id": "browser-product-1",
                                "Description": "Browser Menu Item",
                                "Category": "Entree",
                                "Unit Price": 12.5,
                            }
                        ],
                        "customers": [
                            {
                                "customer_id": "browser-customer-1",
                                "customer_name": "Browser Customer",
                            }
                        ],
                        "events": [
                            {
                                "event_id": "browser-event-1",
                                "customer_id": "browser-customer-1",
                                "event_name": "Browser Event",
                            }
                        ],
                    }
                ],
            },
            "estimates": [],
            "nextNumber": 1500,
        }
        preview = self.client.post(
            "/api/admin/imports/browser-demo/preview",
            json={"state": state},
            headers=self.mutation_headers("preview-browser"),
        )
        self.assertEqual(preview.status_code, 201, preview.text)
        self.assertTrue(preview.json()["summary"]["can_safe_merge"])
        self.assertEqual(preview.json()["summary"]["additions"]["companies"], 1)
        job_id = preview.json()["job_id"]
        committed = self.client.post(
            "/api/admin/imports/browser-demo/commit",
            json={"job_id": job_id, "strategy": "safe_merge", "change_reason": "Recover browser data"},
            headers=self.mutation_headers("commit-browser"),
        )
        self.assertEqual(committed.status_code, 200, committed.text)
        self.assertEqual(committed.json()["inserted"]["companies"], 1)
        self.assertIsNotNone(self.repository.company("browser-company-1"))
        self.assertIsNotNone(self.repository.product("browser-company-1", "browser-product-1"))

        conflicting = {
            **state,
            "store": {
                **state["store"],
                "companies": [{**state["store"]["companies"][0], "business_email": "changed@example.com"}],
            },
        }
        conflict_preview = self.client.post(
            "/api/admin/imports/browser-demo/preview",
            json={"state": conflicting},
            headers=self.mutation_headers("preview-conflict"),
        )
        conflict_job = conflict_preview.json()["job_id"]
        self.assertFalse(conflict_preview.json()["summary"]["can_safe_merge"])
        blocked = self.client.post(
            "/api/admin/imports/browser-demo/commit",
            json={"job_id": conflict_job, "strategy": "safe_merge", "change_reason": "Blocked merge"},
            headers=self.mutation_headers("blocked-merge"),
        )
        self.assertEqual(blocked.status_code, 409)
        preserved = self.client.post(
            "/api/admin/imports/browser-demo/commit",
            json={"job_id": conflict_job, "strategy": "preserve_copy", "change_reason": "Preserve conflict"},
            headers=self.mutation_headers("preserve-conflict"),
        )
        self.assertEqual(preserved.status_code, 200, preserved.text)
        recovered_id = preserved.json()["company_id_map"]["browser-company-1"]
        self.assertIn("Browser recovery", self.repository.company(recovered_id)["business_name"])

    def test_concurrent_writers_are_serialized_without_lost_rows(self) -> None:
        def create(index: int) -> str:
            customer = self.repository.create_customer(
                self.company_id,
                {"customer_name": f"Concurrent {index}"},
                "Concurrent fixture",
                MutationContext(actor=f"writer-{index}"),
            )
            return customer["customer_id"]

        with ThreadPoolExecutor(max_workers=8) as executor:
            identifiers = list(executor.map(create, range(24)))
        self.assertEqual(len(set(identifiers)), 24)
        self.assertEqual(len(self.repository.list_customers(self.company_id, limit=100)), 24)
        self.assertEqual(self.repository.database_health()["integrity"], "ok")

    def test_estimate_create_revise_conflict_and_archive_workflow(self) -> None:
        customer_response = self.client.post(
            f"/api/companies/{self.company_id}/customers",
            json={"customer_name": "Estimate Customer", "change_reason": "Estimate fixture"},
            headers=self.mutation_headers("estimate-customer"),
        )
        customer = customer_response.json()
        event_response = self.client.post(
            f"/api/companies/{self.company_id}/events",
            json={
                "customer_id": customer["customer_id"],
                "event_name": "Estimate Event",
                "guest_count": 10,
                "change_reason": "Estimate fixture",
            },
            headers=self.mutation_headers("estimate-event"),
        )
        event = event_response.json()
        product_response = self.client.post(
            f"/api/companies/{self.company_id}/products",
            json={
                "name": "Lunch",
                "price_cents": 1250,
                "pricing_unit": "guest",
                "quantity_rule": "guest_count",
                "change_reason": "Estimate fixture",
            },
            headers=self.mutation_headers("estimate-product"),
        )
        product = product_response.json()
        resolved_response = self.client.post(
            f"/api/companies/{self.company_id}/products/resolve",
            json={"event_id": event["event_id"], "product_ids": [product["product_id"]]},
        )
        self.assertEqual(resolved_response.status_code, 200, resolved_response.text)
        line = resolved_response.json()["line_items"][0]
        draft = {
            "company_id": self.company_id,
            "customer_id": customer["customer_id"],
            "event_id": event["event_id"],
            "line_items": [line],
            "revision_reason": "Initial estimate",
        }
        created = self.client.post(
            "/api/estimates",
            json=draft,
            headers=self.mutation_headers("estimate-create"),
        )
        replay = self.client.post(
            "/api/estimates",
            json=draft,
            headers=self.mutation_headers("estimate-create"),
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(replay.json(), created.json())
        estimate = created.json()
        self.assertEqual(estimate["revision_number"], 1)
        self.assertEqual(estimate["total"], 125)

        revised_draft = {
            **draft,
            "estimate_number": estimate["estimate_number"],
            "base_revision": 1,
            "revision_reason": "Increased guest count manually",
            "line_items": [{**line, "Qty": 12}],
        }
        revised = self.client.post(
            "/api/estimates",
            json=revised_draft,
            headers=self.mutation_headers("estimate-revise"),
        )
        self.assertEqual(revised.status_code, 201, revised.text)
        self.assertEqual(revised.json()["revision_number"], 2)
        self.assertEqual(revised.json()["total"], 150)
        stale = self.client.post(
            "/api/estimates",
            json=revised_draft,
            headers=self.mutation_headers("estimate-stale"),
        )
        self.assertEqual(stale.status_code, 409)
        history = self.client.get(f"/api/estimates/{estimate['estimate_number']}/revisions")
        self.assertEqual([item["revision_number"] for item in history.json()], [2, 1])

        archived = self.client.post(
            f"/api/estimates/{estimate['estimate_number']}/archive",
            json={"base_revision": 2, "change_reason": "No longer active"},
            headers=self.mutation_headers("estimate-archive"),
        )
        self.assertEqual(archived.status_code, 200)
        self.assertEqual(self.client.get("/api/estimates").json(), [])
        self.assertEqual(
            self.client.get(f"/api/estimates/{estimate['estimate_number']}").json()["revision_number"],
            2,
        )


if __name__ == "__main__":
    unittest.main()
