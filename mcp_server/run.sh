#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
environment_file="${OFFICE_MCP_ENV_FILE:-${project_root}/mcp_server/.env}"

if [[ ! -r "${environment_file}" ]]; then
  echo "MCP environment file is missing: ${environment_file}" >&2
  exit 66
fi

set -a
# shellcheck disable=SC1090
source "${environment_file}"
set +a

cd "${project_root}"
exec "${project_root}/mcp_server/.venv/bin/python" -m mcp_server.server "$@"
