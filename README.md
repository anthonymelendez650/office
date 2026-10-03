# Silverspoon Catering Office

React/Vinext and FastAPI application for companies, catalog products, customers, events, versioned estimates, and snapshot-safe PDFs. SQLite is the only active persistence layer. Historical JSON files are accepted only by the one-time migration command and are archived after verification.

## Architecture

- React 19, TypeScript, Vinext/Vite frontend
- FastAPI and Pydantic API
- SQLite in WAL mode with foreign keys, `BEGIN IMMEDIATE` writes, a 30-second busy timeout, and `synchronous=FULL`
- Immutable entity and estimate revisions
- Actor, request, reason, and idempotency-key audit records
- Scoped bearer tokens for MCP/service clients
- Trusted Nginx Basic-auth bridge for the browser UI
- ReportLab PDF snapshots

The frontend uses the same-origin API by default. Seeded browser-only mode is available only when `NEXT_PUBLIC_DEMO_MODE=true` is explicitly set.

## SQLite data model

The database defaults to `backend/data/office.sqlite3` and contains normalized tables for:

- companies
- products
- customers
- events
- estimates and estimate revisions
- normalized estimate line items
- generic entity revisions
- audit log entries
- API tokens
- idempotency records
- browser import jobs
- settings and migration metadata

Deleting business records is not supported. Companies, products, customers, events, and estimates are archived and can be restored.

## Authentication scopes

| Scope | Access |
| --- | --- |
| `office.read` | Read ordinary records and summaries |
| `office.internal.read` | Read internal notes |
| `office.pii.read` | Read customer email, phone, and billing address |
| `office.catalog.write` | Create and version products |
| `office.crm.write` | Create and version companies, customers, and events |
| `office.estimates.write` | Create and revise estimates |
| `office.archive` | Archive and restore records |
| `office.admin` | All scopes plus audit and import administration |

Every HTTP mutation requires an `Idempotency-Key` header. Updates require the version or estimate revision originally read; stale writes return `409`.

## Local development

Create and start the backend:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
OFFICE_AUTH_REQUIRED=false backend/.venv/bin/python -m uvicorn backend.app.main:app --reload --port 8000
```

Start the frontend:

```bash
cp .env.example .env.local
npm ci
npm run dev
```

For split local ports, set `NEXT_PUBLIC_API_URL=http://localhost:8000`. Leave it unset in production to use `/api` on the current origin.

Docker development is also available:

```bash
docker compose up --build
```

## JSON migration

Make a directory backup first. Then run the migration while the application is stopped:

```bash
PYTHONPATH=. backend/.venv/bin/python backend/scripts/migrate_json_to_sqlite.py \
  --data-dir backend/data \
  --archive-json
```

The command copies every active JSON file into a staging directory, normalizes historical schemas there, builds a candidate SQLite database, compares imported row counts, runs `PRAGMA integrity_check`, checkpoints the WAL, atomically installs `office.sqlite3`, and only then moves the JSON sources under `backend/data/legacy-json-archive/<timestamp>/` with a checksum manifest. It is safe to rerun.

See `MIGRATION_RUNBOOK.md` for production cutover and rollback.

## Browser-local reconciliation

On the first API-mode load, the frontend looks for the old `silverspoon-office-demo-v2/v3/v4` localStorage records. It previews them through the admin import API and asks before committing:

- `safe_merge` adds records only when server records are identical or absent.
- `preserve_copy` remaps conflicting IDs and estimate numbers into a separate recovered workspace.

The server state is never silently overwritten. The CLI equivalent is `backend/scripts/import_browser_demo.py`.

## MCP server

`mcp_server` is a thin adapter over the HTTP API and exposes tools for companies, products, customers/clients, events, revisions, estimates, archive/restore operations, and health/capability discovery. It has no direct database access.

Install and run it over stdio:

```bash
python3 -m venv mcp_server/.venv
mcp_server/.venv/bin/pip install -r mcp_server/requirements.txt
```

Create a standard MCP token after migration and run the secret-file launcher:

```bash
PYTHONPATH=. backend/.venv/bin/python backend/scripts/create_api_token.py \
  --database backend/data/office.sqlite3 \
  --name office-mcp \
  --mcp \
  --output-env mcp_server/.env
./mcp_server/run.sh
```

The environment file is created with mode `0600`, the raw token is not printed, and only its SHA-256 hash is stored in SQLite. See `mcp_server/README.md` for client configuration.

The root installer also starts `office-mcp.service` on loopback and exposes the authenticated
Streamable HTTP transport at `https://office.premiumdynasty.com/mcp`. Its client-facing token uses
only `office.mcp.connect`; it is separate from the internal MCP-to-API token above.

## Operations

Create a verified online backup:

```bash
PYTHONPATH=. backend/.venv/bin/python backend/scripts/backup_sqlite.py \
  --database backend/data/office.sqlite3 \
  --backup-dir /opt/webapps/backups/office \
  --retain 30
```

Health endpoints:

- `GET /api/health`: liveness plus database/schema identity
- `GET /api/ready`: integrity, migration marker, schema version, and table counts

The deployment includes daily backup and two-minute readiness systemd timers. `deploy/install-root.sh` installs the frontend, backend, MCP service, Nginx configuration, trusted proxy secret, permissions, and timers after the database has been migrated.

## Tests

```bash
PYTHONPATH=. backend/.venv/bin/python -m unittest discover -s backend/tests -v
PYTHONPATH=mcp_server/.venv/lib/python3.12/site-packages:. backend/.venv/bin/python \
  -m unittest discover -s mcp_server/tests -v
npm run lint
npm test
```

The backend suite covers legacy import, migration archiving, SQLite integrity, concurrent writers, optimistic conflicts, idempotent replay, auth scopes, redaction, audit history, browser reconciliation, estimate snapshots, and PDFs.
