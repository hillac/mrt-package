#!/usr/bin/env bash

set -euo pipefail

test -f dist/index.js
test -f dist/index.js.map
test -f dist/index.d.ts

if find src -type f -name '*.css' -print -quit | grep -q .; then
  test -f styles.css
fi

npm pack --dry-run
