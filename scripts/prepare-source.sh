#!/usr/bin/env bash

set -euo pipefail

upstream_path="${UPSTREAM_PATH:?UPSTREAM_PATH is not set}"

rm -rf generated
mkdir -p generated/src generated/tests

cp -R "upstream/${upstream_path}/src/mantine-react-table/." generated/src/
cp -R tests/. generated/tests/
cp upstream/LICENSE generated/LICENSE
cp package-template/tsconfig.json generated/tsconfig.json
cp package-template/rollup.config.mjs generated/rollup.config.mjs
