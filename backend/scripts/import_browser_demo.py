from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend.app.browser_import import BrowserDataImporter
from backend.app.storage import MutationContext, SqliteRepository


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview or commit an exported Office browser demo workspace")
    parser.add_argument("export", type=Path)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--strategy", choices=("safe_merge", "preserve_copy"), default="safe_merge")
    parser.add_argument("--actor", default="browser-import-cli")
    parser.add_argument("--reason", default="Imported browser-local workspace")
    arguments = parser.parse_args()
    if not arguments.database.is_file():
        raise FileNotFoundError(arguments.database)
    state = json.loads(arguments.export.read_text(encoding="utf-8"))
    repository = SqliteRepository(database_path=arguments.database, initialize_data=False)
    importer = BrowserDataImporter(repository)
    _normalized, summary = importer.preview(state)
    result: dict[str, object] = {"summary": summary, "committed": False}
    if arguments.commit:
        job_id = repository.create_import_job("browser_demo", arguments.actor, state, summary)
        context = MutationContext(actor=arguments.actor, request_id=f"cli-{job_id}")
        result = {
            "job_id": job_id,
            "committed": True,
            "result": importer.commit(job_id, arguments.strategy, arguments.reason, context),
        }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
