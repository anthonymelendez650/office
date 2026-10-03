from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.app.catalog import utc_now
from backend.app.services import (
    build_estimate,
    calculate_totals,
    default_quantity,
    infer_product_rules,
    resolve_product_selection,
)
from backend.app.storage import SCHEMA_VERSION, JsonRepository


class TotalsTests(unittest.TestCase):
    def test_explicit_charge_groups_and_tax_classes(self) -> None:
        items = [
            {"charge_group": "item", "tax_class": "taxable", "Qty": 10, "Unit Price": 10},
            {"charge_group": "service", "tax_class": "taxable", "Qty": 1, "Unit Price": 200},
            {"charge_group": "staff", "tax_class": "non_taxable", "Qty": 10, "Unit Price": 30},
            {"charge_group": "delivery", "tax_class": "taxable", "Qty": 1, "Unit Price": 50},
        ]
        totals = calculate_totals(
            items,
            tax_percent=10,
            service_percent=10,
            gratuity_percent=20,
            deposit_amount=20,
            gratuity_taxable=False,
        )
        self.assertEqual(totals["items_subtotal"], 100)
        self.assertEqual(totals["staff_total"], 300)
        self.assertEqual(totals["service_items_total"], 200)
        self.assertEqual(totals["service_charge"], 10)
        self.assertEqual(totals["gratuity"], 20)
        self.assertEqual(totals["taxable_subtotal"], 360)
        self.assertEqual(totals["tax"], 36)
        self.assertEqual(totals["total"], 716)
        self.assertEqual(totals["balance_due"], 696)

    def test_explicit_quantity_rules_use_event_values(self) -> None:
        event = {
            "guest_count": 120,
            "utensils_buffer": 20,
            "servers_count": 5,
            "servers_hours": 6,
            "kitchen_staff_count": 3,
            "kitchen_staff_hours": 8,
        }
        self.assertEqual(default_quantity({"quantity_rule": "guest_count"}, event), 120)
        self.assertEqual(default_quantity({"quantity_rule": "guest_plus_buffer"}, event), 140)
        self.assertEqual(default_quantity({"quantity_rule": "server_hours"}, event), 30)
        self.assertEqual(default_quantity({"quantity_rule": "kitchen_staff_hours"}, event), 24)

    def test_legacy_product_rules_are_inferred_once(self) -> None:
        server = infer_product_rules({"Category": "Staff", "Description": "Servers"})
        self.assertEqual(server["charge_group"], "staff")
        self.assertEqual(server["quantity_rule"], "server_hours")
        self.assertEqual(server["pricing_unit"], "hour")

    def test_estimate_uses_draft_snapshot_and_records_override(self) -> None:
        company = {
            "company_id": "company-1",
            "business_name": "Test Catering",
            "business_email": "",
            "business_phone": "",
            "business_address": "",
            "payment_terms": "",
            "estimate_notes": "",
            "products": [{
                "product_id": "p1", "Category": "Hot Entree", "Description": "Chicken",
                "Notes": "Per guest", "Unit Price": 18, "pricing_unit": "guest",
                "quantity_rule": "guest_count", "charge_group": "item", "tax_class": "taxable",
            }],
        }
        customer = {
            "customer_id": "c1", "customer_name": "Client", "customer_email": "", "customer_phone": "",
            "billing_address": "", "organization": "", "internal_notes": "", "archived": False,
        }
        event = {
            "event_id": "e1", "customer_id": "c1", "event_name": "Party", "event_type": "Party",
            "event_date": "12-01-2026", "venue": "", "guest_count": 20, "charge_tax": True,
            "tax_percent": 10, "archived": False,
        }
        estimate = build_estimate(
            company=company,
            customer=customer,
            event=event,
            draft_items=[{
                "line_id": "line-1", "source_product_id": "p1", "Category": "Hot Entree",
                "Description": "Chicken", "Notes": "Locked proposal rate", "Qty": 20, "Unit Price": 15,
                "pricing_unit": "guest", "charge_group": "item", "tax_class": "taxable",
                "is_custom": False, "override_reason": "Early booking rate",
            }],
            estimate_number="EST-1",
            revision_number=1,
            deposit_amount=50,
        )
        self.assertEqual(estimate["line_items"][0]["Unit Price"], 15)
        self.assertTrue(estimate["line_items"][0]["price_overridden"])
        self.assertEqual(estimate["subtotal"], 300)
        self.assertEqual(estimate["tax"], 30)
        self.assertEqual(estimate["balance_due"], 280)

    def test_selection_snapshot_is_version_aware_and_customer_safe(self) -> None:
        product = {
            "product_id": "p1",
            "company_id": "company-1",
            "sku": "ENT-001",
            "name": "Chicken",
            "customer_description": "Served with seasonal vegetables",
            "internal_notes": "Do not expose this purchasing note",
            "category_id": "hot-entree",
            "category": "Hot Entree",
            "price_cents": 2000,
            "currency": "USD",
            "pricing_unit": "guest",
            "quantity_rule": "guest_count",
            "default_quantity": 1,
            "minimum_quantity": 1,
            "quantity_step": 1,
            "charge_group": "item",
            "tax_class": "taxable",
            "status": "active",
            "sort_order": 0,
            "version": 3,
        }
        event = {"guest_count": 20}
        selected_at = utc_now()
        resolved = resolve_product_selection(product, event, selected_at)
        self.assertEqual(resolved["source_product_version"], 3)
        self.assertEqual(resolved["catalog_price_cents_at_selection"], 2000)
        self.assertEqual(resolved["suggested_quantity"], 20)
        self.assertEqual(resolved["Notes"], "Served with seasonal vegetables")
        self.assertNotIn("internal_notes", resolved)

        company = {
            "company_id": "company-1",
            "business_name": "Test Catering",
            "business_email": "",
            "business_phone": "",
            "business_address": "",
            "payment_terms": "",
            "estimate_notes": "",
            "products": [product],
        }
        customer = {"customer_id": "c1", "customer_name": "Client"}
        event = {"event_id": "e1", "customer_id": "c1", "guest_count": 20, "charge_tax": False}
        estimate = build_estimate(
            company=company,
            customer=customer,
            event=event,
            draft_items=[{
                **resolved,
                "source_product_version": 2,
                "catalog_price_cents_at_selection": 1800,
                "Unit Price": 18,
            }],
            estimate_number="EST-2",
        )
        line = estimate["line_items"][0]
        self.assertEqual(line["source_product_version"], 2)
        self.assertEqual(line["catalog_price_cents_at_selection"], 1800)
        self.assertFalse(line["price_overridden"])


class RepositoryTests(unittest.TestCase):
    def test_legacy_store_and_estimate_are_migrated(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "estimates").mkdir()
            company = {
                "company_id": "company-1", "business_name": "Legacy Co", "products": [{
                    "product_id": "p1", "Category": "Sides", "Description": "Rice", "Notes": "Per guest", "Unit Price": 2,
                }],
                "clients": [{
                    "client_id": "client-1", "client_name": "Legacy Client", "event_type": "Wedding",
                    "event_date": "10-10-2026", "guest_count": 10, "venue": "Garden", "deposit_amount": 10,
                }],
            }
            (root / "companies.json").write_text(json.dumps({"selected_company": "Legacy Co", "companies": [company]}))
            legacy_estimate = {
                "estimate_number": "EST-1000", "company_id": "company-1", "company_name": "Legacy Co",
                "client_id": "client-1", "client_name": "Legacy Client", "event_type": "Wedding",
                "event_date": "10-10-2026", "guest_count": 10, "tax_percent": 0,
                "service_charge_percent": 0, "gratuity_percent": 0, "deposit": 10,
                "line_items": [{
                    "product_id": "p1", "Category": "Sides", "Description": "Rice", "Notes": "Per guest",
                    "Qty": 10, "Unit Price": 2, "Line Total": 20,
                }],
            }
            (root / "estimates" / "EST-1000.json").write_text(json.dumps(legacy_estimate))
            repo = JsonRepository(root)
            store = repo.store()
            migrated = store["companies"][0]
            self.assertEqual(store["schema_version"], SCHEMA_VERSION)
            self.assertNotIn("clients", migrated)
            self.assertEqual(migrated["customers"][0]["customer_name"], "Legacy Client")
            self.assertEqual(migrated["events"][0]["event_name"], "Wedding")
            self.assertEqual(migrated["products"][0]["quantity_rule"], "guest_count")
            self.assertEqual(migrated["products"][0]["name"], "Rice")
            self.assertEqual(migrated["products"][0]["price_cents"], 200)
            self.assertEqual(migrated["products"][0]["customer_description"], "Per guest")
            self.assertEqual(migrated["products"][0]["internal_notes"], "")
            self.assertEqual(migrated["products"][0]["version"], 1)
            self.assertEqual(len(repo.product_revisions("company-1", "p1")), 1)
            bootstrap_product = repo.bootstrap_store()["companies"][0]["products"][0]
            self.assertEqual(bootstrap_product["Description"], "Rice")
            self.assertNotIn("name", bootstrap_product)
            estimate = repo.estimate("EST-1000")
            self.assertEqual(estimate["revision_number"], 1)
            self.assertEqual(estimate["line_items"][0]["Unit Price"], 2)
            self.assertEqual(estimate["line_items"][0]["source_product_version"], 1)
            self.assertEqual(estimate["line_items"][0]["catalog_price_cents_at_selection"], 200)

    def test_v3_estimate_source_alias_is_repaired_during_v4_migration(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "estimates").mkdir()
            company = {
                "company_id": "company-1",
                "business_name": "Legacy Co",
                "products": [{
                    "product_id": "None",
                    "Category": "Hot Entree",
                    "Description": "Lomo Saltado",
                    "Notes": "Per guest",
                    "Unit Price": 18,
                }],
                "customers": [{"customer_id": "c1", "customer_name": "Client"}],
                "events": [{"event_id": "e1", "customer_id": "c1", "guest_count": 10}],
            }
            (root / "companies.json").write_text(json.dumps({"companies": [company]}))
            revision = {
                "estimate_number": "EST-1002",
                "revision_number": 1,
                "company_id": "company-1",
                "customer_id": "c1",
                "event_id": "e1",
                "guest_count": 10,
                "created_at": "2026-01-01T10:00:00",
                "line_items": [{
                    "line_id": "line-1",
                    "source_product_id": "None",
                    "Category": "Hot Entree",
                    "Description": "Lomo Saltado",
                    "Notes": "Per guest",
                    "Qty": 10,
                    "Unit Price": 18,
                    "is_custom": False,
                }],
            }
            record = {
                "estimate_number": "EST-1002",
                "archived": False,
                "current_revision": 1,
                "revisions": [revision],
            }
            (root / "estimates" / "EST-1002.json").write_text(json.dumps(record))
            repo = JsonRepository(root)
            product = repo.store()["companies"][0]["products"][0]
            self.assertNotEqual(product["product_id"].casefold(), "none")
            line = repo.estimate("EST-1002")["line_items"][0]
            self.assertEqual(line["source_product_id"], product["product_id"])
            self.assertEqual(line["source_product_version"], 1)
            self.assertEqual(line["catalog_price_cents_at_selection"], 1800)
            self.assertEqual(line["quantity_rule"], "guest_count")
            self.assertEqual(line["suggested_quantity"], 10)

    def test_revisions_append_and_archive_without_deletion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = JsonRepository(Path(directory))
            payload = {
                "estimate_number": "EST-1001", "revision_number": 0, "revision_id": "r1",
                "revision_reason": "Initial", "company_id": "company-1", "customer_id": "c1",
                "customer_name": "Client", "event_id": "e1", "event_name": "Event",
                "event_date": "", "total": 100, "updated_at": "2026-01-01",
            }
            first = repo.save_estimate(dict(payload))
            second_payload = {**payload, "revision_id": "r2", "revision_reason": "Scope change", "total": 125}
            second = repo.save_estimate(second_payload, base_revision=1)
            self.assertEqual(first["revision_number"], 1)
            self.assertEqual(second["revision_number"], 2)
            self.assertEqual(len(repo.list_revisions("EST-1001")), 2)
            self.assertEqual(repo.estimate("EST-1001", 1)["total"], 100)
            repo.archive_estimate("EST-1001")
            self.assertEqual(repo.list_estimates(), [])
            self.assertEqual(repo.estimate("EST-1001")["total"], 125)

    def test_product_integrity_versions_and_legacy_batch_merge(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = JsonRepository(Path(directory))
            first = repo.create_product(
                "company-1",
                {
                    "sku": "ENT-001",
                    "name": "Roasted chicken",
                    "category": "Hot Entree",
                    "price_cents": 1800,
                    "internal_notes": "Preferred supplier: Westside Foods",
                    "pricing_unit": "guest",
                    "quantity_rule": "guest_count",
                },
                "Initial catalog setup",
            )
            self.assertEqual(first["version"], 1)
            self.assertEqual(first["price_cents"], 1800)

            with self.assertRaisesRegex(ValueError, "SKU"):
                repo.create_product(
                    "company-1",
                    {"sku": "ent-001", "name": "Duplicate", "price_cents": 100},
                    "Duplicate test",
                )

            updated = repo.update_product(
                "company-1",
                first["product_id"],
                {"price_cents": 1950},
                expected_version=1,
                change_reason="Ingredient cost adjustment",
            )
            self.assertEqual(updated["version"], 2)
            self.assertEqual(updated["price_cents"], 1950)
            with self.assertRaisesRegex(ValueError, "current version is 2"):
                repo.update_product(
                    "company-1",
                    first["product_id"],
                    {"price_cents": 2000},
                    expected_version=1,
                    change_reason="Stale edit",
                )

            second = repo.create_product(
                "company-1",
                {"sku": "SIDE-001", "name": "Rice", "price_cents": 500},
                "Add side",
            )
            compatibility = repo.replace_products(
                "company-1",
                [{
                    "product_id": first["product_id"],
                    "Category": "Hot Entree",
                    "Description": "Roasted chicken",
                    "Notes": "Per guest",
                    "Unit Price": 20,
                    "pricing_unit": "guest",
                    "quantity_rule": "guest_count",
                    "charge_group": "item",
                    "tax_class": "taxable",
                    "archived": False,
                }],
            )
            self.assertEqual(len(compatibility), 2)
            self.assertIsNotNone(repo.product("company-1", second["product_id"]))
            synced = repo.product("company-1", first["product_id"])
            self.assertEqual(synced["version"], 3)
            self.assertEqual(synced["sku"], "ENT-001")
            self.assertEqual(synced["internal_notes"], "Preferred supplier: Westside Foods")

            archived = repo.set_product_status(
                "company-1", first["product_id"], "archived", 3, "Seasonal item"
            )
            restored = repo.set_product_status(
                "company-1", first["product_id"], "active", 4, "Back in season"
            )
            self.assertEqual(archived["version"], 4)
            self.assertEqual(restored["version"], 5)
            revisions = repo.product_revisions("company-1", first["product_id"])
            self.assertEqual([item["version"] for item in revisions], [5, 4, 3, 2, 1])

    def test_product_usage_tracks_immutable_estimate_revisions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = JsonRepository(Path(directory))
            product = repo.create_product(
                "company-1", {"name": "Delivery", "price_cents": 15000}, "Create delivery"
            )
            payload = {
                "estimate_number": "EST-2001",
                "revision_number": 0,
                "revision_id": "r1",
                "revision_reason": "Initial",
                "company_id": "company-1",
                "customer_id": "c1",
                "customer_name": "Client",
                "event_id": "e1",
                "event_name": "Event",
                "event_date": "",
                "total": 150,
                "updated_at": "2026-01-01",
                "line_items": [{"source_product_id": product["product_id"]}],
            }
            repo.save_estimate(payload)
            usage = repo.product_usage("company-1", product["product_id"])
            self.assertEqual(usage["estimate_count"], 1)
            self.assertEqual(usage["revision_count"], 1)
            self.assertEqual(usage["line_count"], 1)


if __name__ == "__main__":
    unittest.main()
