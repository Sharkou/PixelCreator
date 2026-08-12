#!/bin/sh
# Serves a directory over HTTP so absolute ES module imports (e.g. /src/core/...) resolve correctly.
#
# Legacy uses absolute imports rooted at legacy/ itself (e.g. '/src/core/object.js',
# '/editor/system/dnd.js'), so legacy/ must be the HTTP root, not engine/. Serving
# engine/ makes '/src/...' resolve to a nonexistent engine/src/ and the app fails to load.
#
# Usage: tools/dev-server.sh [port] [root]
#   port   default: 8080
#   root   default: legacy/ (relative to the engine/ repo root)
cd "$(dirname "$0")/.." || exit 1
root="${2:-legacy}"
exec python3 -m http.server "${1:-8080}" --directory "$root"
