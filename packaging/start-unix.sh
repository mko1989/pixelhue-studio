#!/bin/sh
set -eu
PIXELHUE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PIXELHUE_DIR"
exec "$PIXELHUE_DIR/runtime/bin/node" "$PIXELHUE_DIR/launch.mjs"
