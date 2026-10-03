# Office SQLite Cutover Runbook

## Preconditions

1. Confirm the manual directory backup exists and has matching file counts/checksums.
2. Stop browser writes and stop `office.service` and `office-backend.service`.
3. Confirm at least 1 GiB of free space.
4. Confirm the active JSON stores are under `backend/data` and `office.sqlite3` does not already contain unrelated data.

## Migrate

```bash
cd /opt/webapps/sites/office
PYTHONPATH=. backend/.venv/bin/python backend/scripts/migrate_json_to_sqlite.py \
  --data-dir backend/data \
  --archive-json
```

The expected production import at the time this runbook was written is:

```text
companies: 1
products: 27
customers: 2
events: 2
estimates: 4
estimate revisions: 4
integrity: ok
```

Stop if counts differ. Do not install or restart services until the cause is understood.

## Verify

```bash
OFFICE_DATABASE_PATH=/opt/webapps/sites/office/backend/data/office.sqlite3 \
PYTHONPATH=. backend/.venv/bin/python -c \
  'from backend.app.storage import SqliteRepository; print(SqliteRepository(initialize_data=False).database_health())'
```

Create the first online backup:

```bash
mkdir -p /opt/webapps/backups/office
PYTHONPATH=. backend/.venv/bin/python backend/scripts/backup_sqlite.py \
  --database backend/data/office.sqlite3 \
  --backup-dir /opt/webapps/backups/office
```

## Install and start

If the currently installed unit still invokes `.venv/bin/uvicorn` and that launcher has a stale
absolute shebang from an earlier release path, restore service execution temporarily with:

```bash
install -m 0755 deploy/uvicorn-venv-wrapper.sh backend/.venv/bin/uvicorn
```

The hardened unit installed below invokes `python -m uvicorn` directly and does not depend on this
compatibility wrapper.

The root installer creates the shared Nginx/backend proxy secret, installs units, validates Nginx, starts the backend, verifies readiness, starts the frontend, enables timers, and reloads Nginx:

```bash
sudo /opt/webapps/sites/office/deploy/install-root.sh /opt/webapps/sites/office
```

Then verify:

```bash
systemctl --no-pager --full status office-backend.service office-mcp.service office.service
systemctl --no-pager list-timers office-backup.timer office-healthcheck.timer
curl --fail http://127.0.0.1:8000/api/ready
curl --fail -u USER https://office.premiumdynasty.com/api/health
```

## MCP provisioning

Install the isolated MCP environment and create a scoped token:

```bash
cd /opt/webapps/sites/office
python3 -m venv mcp_server/.venv
mcp_server/.venv/bin/pip install -r mcp_server/requirements.txt
PYTHONPATH=. backend/.venv/bin/python backend/scripts/create_api_token.py \
  --database backend/data/office.sqlite3 --name office-mcp --mcp \
  --output-env mcp_server/.env
```

The environment file is created with mode `0600`, and the raw token is not printed. Keep the file
out of source control and move the token to managed secret storage when one is available.

Create a separate Streamable HTTP connection token and store its one-time value in the ChatGPT
host's `SILVERSPOON_MCP_BEARER_TOKEN` environment variable:

```bash
PYTHONPATH=. backend/.venv/bin/python backend/scripts/create_api_token.py \
  --database backend/data/office.sqlite3 --name chatgpt-mcp-connect --mcp-connect
```

The ChatGPT custom MCP URL is `https://office.premiumdynasty.com/mcp`. Do not use the internal
`OFFICE_API_TOKEN` as the client-facing bearer token.

## Rollback

1. Stop `office.service`, `office-mcp.service`, and `office-backend.service`.
2. Preserve the failed `office.sqlite3`, `office.sqlite3-wal`, and `office.sqlite3-shm` for diagnosis.
3. Restore `/opt/webapps/sites/office` from the verified manual backup directory.
4. Restore the previous systemd and Nginx files, run `systemctl daemon-reload`, validate Nginx, and start the prior frontend.

Do not copy JSON files back into a partially used SQLite deployment. Roll back the application directory and service configuration as one unit.
