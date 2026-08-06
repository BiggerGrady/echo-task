#!/bin/sh
set -e

DATA_ROOT="${DATA_ROOT:-/data}"
mkdir -p \
  "$DATA_ROOT/uploads" \
  "$DATA_ROOT/outputs" \
  "$DATA_ROOT/references" \
  "$DATA_ROOT/skills"

exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
