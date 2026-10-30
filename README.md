# Mantine React Table

This repository owns and publishes `@hillac/mantine-react-table`, a Mantine 9
and TanStack Table 9 port of the Mantine React Table example maintained in
`TanStack/table`.

See the [migration guide](https://github.com/TanStack/table/blob/290284f29867021c77afbdd02c05f16f862cb509/examples/react/mantine-react-table/README.md)
when upgrading from the original `mantine-react-table` v2 package.

The package source is checked into `src/` and is edited directly. See
[`UPSTREAM.md`](./UPSTREAM.md) for the pinned upstream revision.

## Development

```bash
pnpm install
pnpm demo
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm validate
```

The playground includes asynchronous mock data, client and mock-server
filtering/sorting, numeric and date ranges, pagination, infinite scrolling, URL
state, configurable latency, loading skeletons, and error banners.

## Consuming the package

```bash
pnpm add @hillac/mantine-react-table
```

The package can also be aliased as `mantine-react-table` in a consumer's
`package.json`.
