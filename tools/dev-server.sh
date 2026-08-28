#!/bin/sh
# Serves a directory over HTTP so absolute ES module imports (e.g. /src/core/...) resolve
# correctly.
#
# IT DELEGATES TO dev-server.py, AND THAT IS THE WHOLE POINT OF THIS FILE NOW. It used to
# run `python3 -m http.server`, which sends `Last-Modified` and no `Cache-Control` — so a
# browser applies heuristic freshness to ES modules and serves the version from before the
# last edit. The failure that produces is not "my change did not appear": one module comes
# from cache while another is re-fetched, and the two no longer agree, so the app dies at
# boot with
#
#   SyntaxError: The requested module '../../core/mod.js'
#                does not provide an export named 'KEY_REFERENCE'
#
# — an export that is present on disk, present over the wire, and present in Node. A whole
# session can be lost to reading correct code looking for the bug. `dev-server.py` answers
# `no-store`, and it existed for this reason while this script went on launching the other
# one.
#
# Usage: tools/dev-server.sh [port] [root]
#   port   default: 8080
#   root   default: legacy/ (relative to the engine/ repo root)
#
# Legacy uses absolute imports rooted at legacy/ itself (e.g. '/src/core/object.js',
# '/editor/system/dnd.js'), so legacy/ must be the HTTP root, not engine/. Serving
# engine/ makes '/src/...' resolve to a nonexistent engine/src/ and the app fails to load.
# For the v2 Editor, serve the repository root: tools/dev-server.sh 8080 .
cd "$(dirname "$0")/.." || exit 1
exec python3 tools/dev-server.py "${1:-8080}" "${2:-legacy}"
