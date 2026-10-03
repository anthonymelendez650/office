from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.app.storage import DATABASE_FILENAME, SqliteRepository


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def active_json_files(data_dir: Path) -> list[Path]:
    archive_root = data_dir / "legacy-json-archive"
    return sorted(
        path
        for path in data_dir.rglob("*.json")
        if path.is_file() and archive_root not in path.parents
    )


def archive_json(data_dir: Path, files: list[Path]) -> Path | None:
    if not files:
        return None
    archive_dir = data_dir / "legacy-json-archive" / utc_stamp()
    manifest: dict[str, Any] = {"archived_at": datetime.now(timezone.utc).isoformat(), "files": []}
    moved: list[tuple[Path, Path]] = []
    try:
        for source in files:
            relative = source.relative_to(data_dir)
            destination = archive_dir / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            entry = {
                "path": str(relative),
                "bytes": source.stat().st_size,
                "sha256": checksum(source),
            }
            os.replace(source, destination)
            moved.append((source, destination))
            manifest["files"].append(entry)
        manifest_path = archive_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        os.chmod(manifest_path, 0o640)
        return archive_dir
    except Exception:
        for source, destination in reversed(moved):
            source.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                os.replace(destination, source)
        raise


def verify_existing(database: Path) -> dict[str, Any]:
    repository = SqliteRepository(database_path=database, initialize_data=False)
    health = repository.database_health()
    if health["status"] != "ok" or health["integrity"] != "ok":
        raise RuntimeError(f"Existing SQLite database failed verification: {health}")
    return health


def migrate(data_dir: Path, database: Path, should_archive: bool) -> dict[str, Any]:
    data_dir = data_dir.resolve()
    database = database.resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    sources = active_json_files(data_dir)
    if database.exists():
        if database.stat().st_size == 0:
            raise RuntimeError(f"Refusing to trust an empty existing database: {database}")
        health = verify_existing(database)
        if sources and health.get("legacy_import_completed") in {"", "not_required"}:
            raise RuntimeError(
                "Active JSON stores still exist but this database has no completed legacy import marker"
            )
        archive_dir = archive_json(data_dir, sources) if should_archive else None
        return {
            "status": "already_migrated",
            "database": str(database),
            "database_sha256": checksum(database),
            "health": health,
            "json_archive": str(archive_dir) if archive_dir else None,
        }
    if not sources:
        raise FileNotFoundError(f"No active JSON stores were found under {data_dir}")
    if not (data_dir / "companies.json").exists():
        raise FileNotFoundError(f"Required legacy store is missing: {data_dir / 'companies.json'}")

    temporary_database: Path | None = None
    import_counts: dict[str, int]
    try:
        with tempfile.TemporaryDirectory(prefix="office-json-migration-", dir=data_dir) as temporary_name:
            staging = Path(temporary_name)
            for source in sources:
                destination = staging / source.relative_to(data_dir)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                if checksum(source) != checksum(destination):
                    raise RuntimeError(f"Staging checksum mismatch for {source}")
            temporary_database = staging / f"{DATABASE_FILENAME}.candidate"
            repository = SqliteRepository(database_path=temporary_database, initialize_data=False)
            import_counts = repository.import_legacy_json(staging)
            health = repository.database_health()
            expected = {
                "companies": import_counts["companies"],
                "products": import_counts["products"],
                "customers": import_counts["customers"],
                "events": import_counts["events"],
                "estimates": import_counts["estimates"],
                "estimate_revisions": import_counts["revisions"],
            }
            if health["status"] != "ok" or health["integrity"] != "ok":
                raise RuntimeError(f"Candidate SQLite integrity check failed: {health}")
            if health["counts"] != expected:
                raise RuntimeError(f"Candidate row counts differ: expected {expected}, got {health['counts']}")
            with repository._connect() as connection:
                checkpoint = connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
                if checkpoint and int(checkpoint[0]) != 0:
                    raise RuntimeError(f"Could not checkpoint candidate database: {tuple(checkpoint)}")
            database.parent.mkdir(parents=True, exist_ok=True)
            os.replace(temporary_database, database)
            temporary_database = None
        os.chmod(database, 0o640)
        installed_health = verify_existing(database)
        archive_dir = archive_json(data_dir, sources) if should_archive else None
        return {
            "status": "migrated",
            "database": str(database),
            "database_bytes": database.stat().st_size,
            "database_sha256": checksum(database),
            "imported": import_counts,
            "health": installed_health,
            "json_archive": str(archive_dir) if archive_dir else None,
        }
    finally:
        if temporary_database and temporary_database.exists():
            temporary_database.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Office JSON data stores to a verified SQLite database")
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--database", type=Path)
    parser.add_argument("--archive-json", action="store_true")
    arguments = parser.parse_args()
    database = arguments.database or arguments.data_dir / DATABASE_FILENAME
    print(json.dumps(migrate(arguments.data_dir, database, arguments.archive_json), indent=2))


if __name__ == "__main__":
    main()
