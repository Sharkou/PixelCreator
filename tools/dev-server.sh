#!/bin/sh
# Serves the engine root over HTTP so absolute ES module imports (e.g. /src/core/...) resolve correctly.
# Usage: tools/dev-server.sh [port]   (default port: 8080)
cd "$(dirname "$0")/.." && exec python3 -m http.server "${1:-8080}"
