#!/bin/sh
set -eu

# Install this file as .venv/bin/uvicorn when a moved virtualenv has a stale shebang.
exec "$(dirname "$0")/python" -m uvicorn "$@"
