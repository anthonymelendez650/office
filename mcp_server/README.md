# Silverspoon Office MCP Server

This is a thin MCP adapter over the authenticated Office HTTP API. It never opens the SQLite database directly, so every MCP mutation uses the same validation, scopes, optimistic versions, idempotency records, and audit log as the browser UI.

## Required environment

```bash
export OFFICE_API_URL=http://127.0.0.1:8000/api
export OFFICE_API_TOKEN=office_redacted
```

The adapter always calls the loopback Office API. Do not expose or copy its internal API token to
an MCP client.

## Run over stdio

```bash
python -m mcp_server.server
```

Example client configuration:

```json
{
  "mcpServers": {
    "silverspoon-office": {
      "command": "/opt/webapps/sites/office/mcp_server/run.sh",
      "args": []
    }
  }
}
```

Provision a standard non-admin token with:

```bash
backend/.venv/bin/python backend/scripts/create_api_token.py \
  --database backend/data/office.sqlite3 --name office-mcp --mcp \
  --output-env mcp_server/.env
```

`mcp_server/run.sh` loads that mode-0600 file without exposing the token in process arguments or client configuration. Without `--output-env`, the token secret is printed once and should be stored in the MCP host's secret storage.

## Streamable HTTP

`office-mcp.service` runs the same adapter on `127.0.0.1:8010`. Nginx exposes its `/mcp`
transport at:

```text
https://office.premiumdynasty.com/mcp
```

The public transport requires a dedicated bearer token with only `office.mcp.connect`. Nginx
validates that token through the Office API's hashed token store, then strips it before proxying to
the MCP process. The MCP process keeps using its separate internal token for audited Office API
operations.

Create a connection token once:

```bash
PYTHONPATH=. backend/.venv/bin/python backend/scripts/create_api_token.py \
  --database backend/data/office.sqlite3 \
  --name chatgpt-mcp-connect \
  --mcp-connect
```

Store the one-time token output in the ChatGPT host's `SILVERSPOON_MCP_BEARER_TOKEN` environment
variable. Configure the custom MCP as Streamable HTTP with the URL above and use that variable name
in the **Bearer token env var** field. Never put the internal `OFFICE_API_TOKEN` in ChatGPT.
