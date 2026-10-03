from __future__ import annotations

import argparse
import json
import os
import shlex
from pathlib import Path

from backend.app.storage import ALL_SCOPES, SqliteRepository

MCP_SCOPES = {
    "office.read",
    "office.internal.read",
    "office.pii.read",
    "office.catalog.write",
    "office.crm.write",
    "office.estimates.write",
    "office.archive",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a hashed Office bearer token; the secret is shown once")
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--scope", action="append", choices=sorted(ALL_SCOPES))
    parser.add_argument("--mcp", action="store_true", help="Grant the standard non-admin MCP scopes")
    parser.add_argument(
        "--mcp-connect",
        action="store_true",
        help="Grant only the connection scope used by the public MCP transport",
    )
    parser.add_argument("--output-env", type=Path, help="Write the secret to a new mode-0600 environment file")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000/api")
    arguments = parser.parse_args()
    if not arguments.database.is_file():
        raise FileNotFoundError(arguments.database)
    scopes = set(arguments.scope or [])
    if arguments.mcp:
        scopes.update(MCP_SCOPES)
    if arguments.mcp_connect:
        scopes.add("office.mcp.connect")
    if not scopes:
        raise ValueError("At least one --scope, --mcp, or --mcp-connect is required")
    output = arguments.output_env.resolve() if arguments.output_env else None
    if output and output.exists():
        raise FileExistsError(output)
    repository = SqliteRepository(database_path=arguments.database, initialize_data=False)
    record, raw_token = repository.create_api_token(arguments.name, scopes)
    if output:
        try:
            output.parent.mkdir(parents=True, exist_ok=True)
            descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as token_file:
                token_file.write(
                    f"OFFICE_API_URL={shlex.quote(arguments.api_url)}\n"
                    f"OFFICE_API_TOKEN={shlex.quote(raw_token)}\n"
                )
                token_file.flush()
                os.fsync(token_file.fileno())
        except Exception:
            repository.revoke_api_token(record["token_id"])
            output.unlink(missing_ok=True)
            raise
        print(json.dumps({**record, "token_file": str(output)}, indent=2))
    else:
        print(json.dumps({**record, "token": raw_token}, indent=2))


if __name__ == "__main__":
    main()
