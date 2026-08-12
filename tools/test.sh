#!/bin/sh
# Runs the unit tests with Node's built-in runner (no dependency, no config).
#
# Usage: tools/test.sh [pattern ...]
#   default: src/**/*.test.js and tools/**/*.test.js
#
# Legacy has no unit tests and is not covered here; its behaviour is captured by the
# parity harness instead (tools/parity/run.js).
cd "$(dirname "$0")/.." || exit 1

if [ "$#" -gt 0 ]; then
    exec node --test "$@"
fi

exec node --test "src/**/*.test.js" "tools/**/*.test.js"
