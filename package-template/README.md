# @@PACKAGE_NAME@@

An ESM-only build of the reusable Mantine React Table implementation from the
TanStack Table examples.

See the [migration guide here](https://github.com/TanStack/table/blob/290284f29867021c77afbdd02c05f16f862cb509/examples/react/mantine-react-table/README.md) for upgrading from the old mantine-react-table v2.

## Installation

```bash
npm install @@PACKAGE_NAME@@
```

If you dont want to have to update all your imports, you can also just alias it for `mantine-react-table` in your package.json.

## Usage

```tsx
import {
  MantineReactTable,
  createMRTColumnHelper,
  useMantineReactTable,
} from '@@PACKAGE_NAME@@'

import '@@PACKAGE_NAME@@/styles.css'
```

Applications must also load Mantine's normal styles:

```tsx
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
```
