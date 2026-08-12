#!/bin/sh
# Runs the v2 unit tests with Node's built-in runner (no dependency, no config).
#
# Usage: tools/test.sh [pattern]
#   pattern  default: src/**/*.test.js
#
# Legacy has no unit tests and is not covered here; its behaviour is captured by the
# parity harness instead (tools/parity/run.js).
cd "$(dirname "$0")/.." || exit 1
exec node --test "${1:-src/**/*.test.js}"
