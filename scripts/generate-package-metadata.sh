#!/usr/bin/env bash

set -euo pipefail

package_name="${PACKAGE_NAME:?PACKAGE_NAME is not set}"
package_version="${PACKAGE_VERSION:?PACKAGE_VERSION is not set}"
upstream_path="${UPSTREAM_PATH:?UPSTREAM_PATH is not set}"
upstream_sha="${UPSTREAM_SHA:?UPSTREAM_SHA is not set}"
repository="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
upstream_package="upstream/${upstream_path}/package.json"

get_version() {
  jq -er --arg name "$1" '
    .dependencies[$name]
    // .devDependencies[$name]
    // error("Missing upstream dependency: " + $name)
  ' "$upstream_package"
}

jq \
  --arg name "$package_name" \
  --arg version "$package_version" \
  --arg repository "$repository" \
  --arg upstreamSha "$upstream_sha" \
  --arg mantineCore "$(get_version '@mantine/core')" \
  --arg mantineDates "$(get_version '@mantine/dates')" \
  --arg mantineHooks "$(get_version '@mantine/hooks')" \
  --arg tablerIcons "$(get_version '@tabler/icons-react')" \
  --arg matchSorter "$(get_version '@tanstack/match-sorter-utils')" \
  --arg reactStore "$(get_version '@tanstack/react-store')" \
  --arg reactTable "$(get_version '@tanstack/react-table')" \
  --arg reactVirtual "$(get_version '@tanstack/react-virtual')" \
  --arg clsx "$(get_version 'clsx')" \
  --arg dayjs "$(get_version 'dayjs')" \
  --arg react "$(get_version 'react')" \
  --arg reactDom "$(get_version 'react-dom')" \
  --arg typesReact "$(get_version '@types/react')" \
  --arg typesReactDom "$(get_version '@types/react-dom')" \
  --arg typescript "$(get_version 'typescript')" \
  '
    .name = $name
    | .version = $version
    | .repository.url = ("git+https://github.com/" + $repository + ".git")
    | .bugs.url = ("https://github.com/" + $repository + "/issues")
    | .homepage = ("https://github.com/" + $repository + "#readme")
    | .xUpstreamRevision = $upstreamSha
    | .peerDependencies = {
        "@mantine/core": $mantineCore,
        "@mantine/dates": $mantineDates,
        "@mantine/hooks": $mantineHooks,
        "@tabler/icons-react": $tablerIcons,
        "clsx": $clsx,
        "dayjs": $dayjs,
        "react": $react,
        "react-dom": $reactDom
      }
    | .dependencies = {
        "@tanstack/match-sorter-utils": $matchSorter,
        "@tanstack/react-store": $reactStore,
        "@tanstack/react-table": $reactTable,
        "@tanstack/react-virtual": $reactVirtual
      }
    | .devDependencies = {
        "@mantine/core": $mantineCore,
        "@mantine/dates": $mantineDates,
        "@mantine/hooks": $mantineHooks,
        "@rollup/plugin-typescript": "^12.1.4",
        "@tabler/icons-react": $tablerIcons,
        "@types/react": $typesReact,
        "@types/react-dom": $typesReactDom,
        "clsx": $clsx,
        "dayjs": $dayjs,
        "jsdom": "^26.1.0",
        "react": $react,
        "react-dom": $reactDom,
        "rimraf": "^6.0.1",
        "rollup": "^4.46.2",
        "rollup-plugin-copy": "^3.5.0",
        "rollup-plugin-delete": "^3.0.1",
        "rollup-plugin-dts": "^6.2.1",
        "rollup-plugin-peer-deps-external": "^2.2.4",
        "rollup-plugin-postcss": "^4.0.2",
        "tslib": "^2.8.1",
        "typescript": $typescript
      }
  ' package-template/package.json > generated/package.json

sed \
  -e "s|@@PACKAGE_NAME@@|${package_name}|g" \
  package-template/README.md > generated/README.md

sed \
  -e "s|@@UPSTREAM_REPOSITORY@@|${UPSTREAM_REPOSITORY:?UPSTREAM_REPOSITORY is not set}|g" \
  -e "s|@@UPSTREAM_REF@@|${UPSTREAM_REF:?UPSTREAM_REF is not set}|g" \
  -e "s|@@UPSTREAM_PATH@@|${upstream_path}|g" \
  -e "s|@@UPSTREAM_SHA@@|${upstream_sha}|g" \
  package-template/UPSTREAM.md > generated/UPSTREAM.md
