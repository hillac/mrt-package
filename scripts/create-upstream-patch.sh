#!/usr/bin/env bash

set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
output_path="${1:-${repository_root}/mantine-react-table-upstream.patch}"
if [[ "${output_path}" != /* ]]; then
  output_path="${repository_root}/${output_path}"
fi
upstream_repository="https://github.com/TanStack/table.git"
upstream_path="examples/react/mantine-react-table/src/mantine-react-table"
upstream_revision="$(node -p "require('${repository_root}/package.json').xUpstreamRevision")"
work_dir="$(mktemp -d /tmp/mrt-upstream-diff.XXXXXX)"
checkout_dir="${work_dir}/tanstack-table"
comparison_dir="${work_dir}/comparison"

cleanup() {
  rm -rf "${work_dir}"
}
trap cleanup EXIT

git init --quiet "${checkout_dir}"
git -C "${checkout_dir}" remote add origin "${upstream_repository}"
git -C "${checkout_dir}" fetch --quiet --depth 1 origin "${upstream_revision}"
git -C "${checkout_dir}" checkout --quiet --detach FETCH_HEAD

mkdir -p "${comparison_dir}"
cp -R "${checkout_dir}/${upstream_path}/." "${comparison_dir}/"
git -C "${comparison_dir}" init --quiet
git -C "${comparison_dir}" add .
git -C "${comparison_dir}" \
  -c user.name='MRT upstream diff' \
  -c user.email='mrt-upstream-diff@localhost' \
  commit --quiet -m upstream

find "${comparison_dir}" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "${repository_root}/src/." "${comparison_dir}/"

git -C "${comparison_dir}" diff --binary \
  --src-prefix="a/${upstream_path}/" \
  --dst-prefix="b/${upstream_path}/" \
  --output="${output_path}"

echo "Created ${output_path} against TanStack/table@${upstream_revision}"
