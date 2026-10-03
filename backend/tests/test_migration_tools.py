from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.app.storage import SqliteRepository
from backend.scripts.migrate_json_to_sqlite import active_json_files, migrate


class MigrationToolTests(unittest.TestCase):
    def test_verified_migration_archives_json_and_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            company = {
                "company_id": "company-test",
                "business_name": "Migration Test",
                "products": [{"product_id": "product-test", "Description": "Lunch", "Unit Price": 10}],
                "customers": [{"customer_id": "customer-test", "customer_name": "Test Customer"}],
                "events": [
                    {
                        "event_id": "event-test",
                        "customer_id": "customer-test",
                        "event_name": "Test Event",
                    }
                ],
            }
            (data_dir / "companies.json").write_text(
                json.dumps({"selected_company": "Migration Test", "companies": [company]}),
                encoding="utf-8",
            )
            (data_dir / "counter.json").write_text(json.dumps({"next_number": 1002}), encoding="utf-8")
            (data_dir / "settings.json").write_text(json.dumps({"theme": "system"}), encoding="utf-8")
            estimates = data_dir / "estimates"
            estimates.mkdir()
            estimate = {
                "estimate_number": "EST-1001",
                "company_id": "company-test",
                "customer_id": "customer-test",
                "customer_name": "Test Customer",
                "event_id": "event-test",
                "event_name": "Test Event",
                "revision_number": 1,
                "revision_reason": "Initial",
                "total": 10,
                "line_items": [
                    {
                        "product_id": "product-test",
                        "Category": "Entree",
                        "Description": "Lunch",
                        "Qty": 1,
                        "Unit Price": 10,
                        "Line Total": 10,
                    }
                ],
            }
            (estimates / "EST-1001.json").write_text(json.dumps(estimate), encoding="utf-8")

            database = data_dir / "office.sqlite3"
            result = migrate(data_dir, database, True)
            self.assertEqual(result["status"], "migrated")
            self.assertEqual(result["imported"]["companies"], 1)
            self.assertEqual(result["imported"]["estimates"], 1)
            self.assertEqual(active_json_files(data_dir), [])
            self.assertTrue(Path(result["json_archive"], "manifest.json").is_file())
            repository = SqliteRepository(database_path=database, initialize_data=False)
            self.assertEqual(repository.database_health()["integrity"], "ok")
            self.assertEqual(repository.estimate("EST-1001")["total"], 10)

            replay = migrate(data_dir, database, True)
            self.assertEqual(replay["status"], "already_migrated")
            self.assertEqual(replay["database_sha256"], result["database_sha256"])


if __name__ == "__main__":
    unittest.main()
