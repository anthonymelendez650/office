from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from backend.app.storage import SqliteRepository


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create and verify an online Office SQLite backup")
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--backup-dir", type=Path, required=True)
    parser.add_argument("--retain", type=int, default=30)
    arguments = parser.parse_args()
    database = arguments.database.resolve()
    backup_dir = arguments.backup_dir.resolve()
    if not database.is_file():
        raise FileNotFoundError(database)
    backup_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(backup_dir, 0o750)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = backup_dir / f"office-{stamp}.sqlite3"
    repository = SqliteRepository(database_path=database, initialize_data=False)
    result = repository.backup_to(target)
    result["sha256"] = checksum(target)
    checksum_path = target.with_suffix(f"{target.suffix}.sha256")
    checksum_path.write_text(f"{result['sha256']}  {target.name}\n", encoding="ascii")
    os.chmod(checksum_path, 0o640)
    backups = sorted(backup_dir.glob("office-*.sqlite3"), key=lambda item: item.stat().st_mtime, reverse=True)
    removed: list[str] = []
    for expired in backups[max(arguments.retain, 1):]:
        expired_checksum = expired.with_suffix(f"{expired.suffix}.sha256")
        expired.unlink()
        if expired_checksum.exists():
            expired_checksum.unlink()
        removed.append(expired.name)
    result["removed"] = removed
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
