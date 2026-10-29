#!/bin/bash
set -e
cd "$(dirname "$0")/.."
if curl -fsS --max-time 2 -H 'Origin: http://127.0.0.1:8787' http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  echo 'DeckFlow is already running: http://127.0.0.1:8787'; exit 0
fi
NODE_BIN="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if command -v node >/dev/null 2>&1; then NODE_BIN="$(command -v node)"; fi
"$NODE_BIN" node_modules/typescript/bin/tsc
"$NODE_BIN" node_modules/vite/bin/vite.js build
exec python3 server/stems.py
