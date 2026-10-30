const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

let browser;
let bundle;
before(async () => {
  const result = await build({
    stdin: {
      contents: `
        import { StrictMode, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { useMantineReactTable } from './src/hooks/useMantineReactTable';
        import { MantineReactTable } from './src/components/MantineReactTable';
        import { MantineProvider } from '@mantine/core';
        const columns = [{ accessorKey: 'value', header: 'Value', filterFn: 'greaterThan' }];
        function Harness() {
          const [data, setData] = useState(window.options.data ?? []);
          const [state, setState] = useState(window.controlledState ?? {});
          window.setData = setData;
          window.setState = setState;
          const table = useMantineReactTable({
            columns, data, state, enableGrouping: true,
            ...window.options,
            ...(window.options.strictNumericCallbacks ? {
              columns: [{ accessorKey: 'value', header: 'Value',
                filterFn: (row, id, minimum) => Number(row.original.value.toFixed(7)) >= minimum,
                sortFn: (left, right) => Number(left.original.value.toFixed(7)) - Number(right.original.value.toFixed(7)),
              }],
            } : {}),
            onColumnFiltersChange: updater => {
              window.filterWrites.push(typeof updater);
              setState(previous => ({...previous, columnFilters: typeof updater === 'function'
                ? updater(previous.columnFilters ?? window.options.initialState?.columnFilters ?? [])
                : updater}));
            },
            onGlobalFilterChange: updater => {
              window.globalFilterWrites.push(typeof updater);
              setState(previous => ({...previous, globalFilter: typeof updater === 'function'
                ? updater(previous.globalFilter) : updater}));
            },
            onSortingChange: updater => {
              window.sortingWrites.push(typeof updater);
              setState(previous => ({...previous, sorting: typeof updater === 'function'
                ? updater(previous.sorting ?? window.options.initialState?.sorting ?? [])
                : updater}));
            },
            ...(window.controlledState ? {
              onPaginationChange: updater => {
                window.paginationWrites.push(typeof updater);
                if (window.acceptPaginationChanges) {
                  setState(previous => ({...previous, pagination: typeof updater === 'function' ? updater(previous.pagination) : updater}));
                }
              },
            } : {}),
          });
          window.table = table;
          window.snapshot = () => ({
            state: table.getState(),
            values: table.getRowModel().rows.map(row => row.getValue('value')),
            manualFiltering: table.options.manualFiltering,
            manualSorting: table.options.manualSorting,
            manualPagination: table.options.manualPagination,
            manualGrouping: table.options.manualGrouping,
          });
          return <><span>Ready</span>{window.renderTable && <MantineProvider><MantineReactTable table={table} /></MantineProvider>}</>;
        }
        createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
      `,
      loader: 'tsx',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    jsx: 'automatic',
    loader: { '.css': 'empty', '.module.css': 'empty' },
  });
  bundle = result.outputFiles[0].text;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  browser = await chromium.launch(
    executablePath ? { executablePath } : undefined,
  );
});
after(async () => {
  await browser?.close();
});

async function withTable(options, run, controlledState, renderTable = false) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setContent('<div id="root"></div>');
    await page.evaluate((options) => {
      window.options = options;
    }, options);
    await page.evaluate((state) => {
      window.controlledState = state;
      window.paginationWrites = [];
      window.sortingWrites = [];
      window.filterWrites = [];
      window.globalFilterWrites = [];
      window.acceptPaginationChanges = true;
    }, controlledState);
    await page.evaluate((value) => {
      window.renderTable = value;
    }, renderTable);
    await page.addScriptTag({ content: bundle });
    await expect(page.getByText('Ready')).toBeVisible();
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

test('controlled loading, saving, and banner flags remain visible to MRT consumers', () =>
  withTable({}, async (page) => {
    const flags = [
      'isLoading',
      'isSaving',
      'showLoadingOverlay',
      'showProgressBars',
      'showSkeletons',
      'showAlertBanner',
    ];
    for (const flag of flags) {
      await page.evaluate((flag) => window.setState({ [flag]: true }), flag);
      await expect
        .poll(() =>
          page.evaluate((flag) => window.snapshot().state[flag], flag),
        )
        .toBe(true);
      await page.evaluate((flag) => window.setState({ [flag]: false }), flag);
      await expect
        .poll(() =>
          page.evaluate((flag) => window.snapshot().state[flag], flag),
        )
        .toBe(false);
    }
  }));

test('client filtering, sorting, and pagination work after initially empty data', () =>
  withTable(
    {
      initialState: {
        columnFilters: [{ id: 'value', value: 1 }],
        sorting: [{ id: 'value', desc: true }],
        pagination: { pageIndex: 0, pageSize: 2 },
      },
    },
    async (page) => {
      for (const key of [
        'manualFiltering',
        'manualSorting',
        'manualPagination',
        'manualGrouping',
      ]) {
        assert.notEqual(
          await page.evaluate((key) => window.snapshot()[key], key),
          true,
        );
      }
      await page.evaluate(() =>
        window.setData([
          { value: 1 },
          { value: 3 },
          { value: 2 },
          { value: 4 },
        ]),
      );
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([4, 3]);
      await page.evaluate(() => window.setData([]));
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([]);
      await page.evaluate(() =>
        window.setData([{ value: 2 }, { value: 1 }, { value: 5 }]),
      );
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([5, 2]);
    },
  ));

test('explicit manual modes continue to leave server data untouched', () =>
  withTable(
    {
      manualFiltering: true,
      manualSorting: true,
      manualPagination: true,
      initialState: {
        columnFilters: [{ id: 'value', value: 100 }],
        sorting: [{ id: 'value', desc: true }],
        pagination: { pageIndex: 0, pageSize: 1 },
      },
    },
    async (page) => {
      await page.evaluate(() => window.setData([{ value: 1 }, { value: 2 }]));
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([1, 2]);
    },
  ));

const paginationRows = Array.from({ length: 6 }, (_, index) => ({
  value: index + 1,
}));
const paginationOptions = {
  data: paginationRows,
  autoResetPageIndex: false,
  initialState: { pagination: { pageIndex: 0, pageSize: 3 } },
};

test('controlled pagination overrides initial defaults and follows external replacements', () =>
  withTable(
    paginationOptions,
    async (page) => {
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([3, 4]);
      assert.deepEqual(await page.evaluate(() => window.paginationWrites), []);
      await page.evaluate(() =>
        window.setState({ pagination: { pageIndex: 4, pageSize: 1 } }),
      );
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([5]);
      await page.evaluate(() =>
        window.setState({ pagination: { pageIndex: 0, pageSize: 2 } }),
      );
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([1, 2]);
      assert.deepEqual(await page.evaluate(() => window.paginationWrites), []);
    },
    { pagination: { pageIndex: 1, pageSize: 2 } },
  ));

test('controlled pagination requests changes without overriding a consumer that rejects them', () =>
  withTable(
    paginationOptions,
    async (page) => {
      await page.evaluate(() => window.table.nextPage());
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([5, 6]);
      await page.evaluate(() => {
        window.acceptPaginationChanges = false;
        window.table.previousPage();
      });
      await expect
        .poll(() => page.evaluate(() => window.paginationWrites.length))
        .toBe(2);
      assert.deepEqual(
        await page.evaluate(() => window.snapshot().values),
        [5, 6],
      );
      await page.evaluate(() => {
        window.acceptPaginationChanges = true;
        window.table.setPageSize(3);
      });
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([4, 5, 6]);
      await page.evaluate(() => window.table.resetPagination());
      await expect
        .poll(() => page.evaluate(() => window.snapshot().values))
        .toEqual([1, 2, 3]);
    },
    { pagination: { pageIndex: 1, pageSize: 2 } },
  ));

test('uncontrolled pagination supports navigation, page size changes and reset', () =>
  withTable(paginationOptions, async (page) => {
    await expect
      .poll(() => page.evaluate(() => window.snapshot().values))
      .toEqual([1, 2, 3]);
    await page.evaluate(() => window.table.nextPage());
    await expect
      .poll(() => page.evaluate(() => window.snapshot().values))
      .toEqual([4, 5, 6]);
    await page.evaluate(() => window.table.setPageSize(2));
    await expect
      .poll(() => page.evaluate(() => window.snapshot().values))
      .toEqual([3, 4]);
    await page.evaluate(() => window.table.resetPagination());
    await expect
      .poll(() => page.evaluate(() => window.snapshot().values))
      .toEqual([1, 2, 3]);
  }));

test('ranked search does not echo sorting on mount and restores it after clearing search', () =>
  withTable(
    {
      ...paginationOptions,
      enableGlobalFilter: true,
      initialState: {
        pagination: { pageIndex: 0, pageSize: 3 },
        sorting: [{ id: 'value', desc: true }],
      },
    },
    async (page) => {
      assert.deepEqual(await page.evaluate(() => window.sortingWrites), []);
      await page.evaluate(() => window.table.setGlobalFilter('1'));
      await expect
        .poll(() => page.evaluate(() => window.snapshot().state.sorting))
        .toEqual([]);
      await page.evaluate(() => window.table.setGlobalFilter(''));
      await expect
        .poll(() => page.evaluate(() => window.snapshot().state.sorting))
        .toEqual([{ id: 'value', desc: true }]);
      assert.equal(await page.evaluate(() => window.sortingWrites.length), 2);
    },
  ));

for (const variant of ['text', 'multi-select']) {
  test(`${variant} and global inputs restore controlled filters without echoing callbacks`, () =>
    withTable(
      {
        data: [{ value: 'apple' }, { value: 'apricot' }, { value: 'banana' }],
        columns: [
          {
            accessorKey: 'value',
            header: 'Value',
            filterVariant: variant,
            ...(variant === 'text' ? { filterFn: 'contains' } : {}),
            mantineFilterMultiSelectProps: {
              data: ['apple', 'apricot', 'banana'],
            },
          },
        ],
        autoResetPageIndex: false,
        initialState: { showColumnFilters: true, showGlobalFilter: true },
      },
      async (page) => {
        await page.waitForTimeout(600);
        assert.deepEqual(
          await page.evaluate(() => [
            window.filterWrites,
            window.globalFilterWrites,
            window.sortingWrites,
          ]),
          [[], [], []],
        );
        assert.deepEqual(
          await page.evaluate(() => window.snapshot().state.pagination),
          { pageIndex: 1, pageSize: 1 },
        );
        assert.deepEqual(await page.evaluate(() => window.snapshot().values), [
          'apricot',
        ]);
        if (variant === 'text') {
          const input = page.getByRole('textbox', { name: 'Filter by Value' });
          await input.fill('banana');
          await expect
            .poll(() => page.evaluate(() => window.filterWrites.length))
            .toBe(1);
          await input.fill('app');
          await page.evaluate(() =>
            window.setState({
              columnFilters: [{ id: 'value', value: 'apricot' }],
              globalFilter: '',
              pagination: { pageIndex: 0, pageSize: 1 },
            }),
          );
          await expect(input).toHaveValue('apricot');
          await page.waitForTimeout(600);
          assert.equal(
            await page.evaluate(() => window.filterWrites.length),
            1,
          );
        }
      },
      {
        columnFilters: [
          {
            id: 'value',
            value: variant === 'text' ? 'ap' : ['apple', 'apricot'],
          },
        ],
        globalFilter: '',
        pagination: { pageIndex: 1, pageSize: 1 },
      },
      true,
    ));
}

for (const loadingFlag of ['isLoading', 'showSkeletons']) {
  test(`${loadingFlag} placeholders bypass custom filters and sorts until data arrives`, () =>
    withTable(
      {
        strictNumericCallbacks: true,
        autoResetPageIndex: false,
        initialState: {
          columnFilters: [{ id: 'value', value: 0.5 }],
          sorting: [{ id: 'value', desc: false }],
          pagination: { pageIndex: 1, pageSize: 2 },
        },
      },
      async (page) => {
        await expect.poll(() => page.evaluate(() => window.snapshot().values)).toEqual([undefined, undefined]);
        await page.evaluate(() => window.setData([
          { value: 2.0000001 }, { value: 0.25 }, { value: 0.5 }, { value: 1 },
        ]));
        // Background loading with real data must still filter, sort and paginate.
        await expect.poll(() => page.evaluate(() => window.snapshot().values)).toEqual([2.0000001]);
        await page.evaluate(() => window.setState({}));
        await expect.poll(() => page.evaluate(() => window.snapshot().values)).toEqual([2.0000001]);
        await page.evaluate((flag) => {
          window.setState({ [flag]: true });
          window.setData([]);
        }, loadingFlag);
        await expect.poll(() => page.evaluate(() => window.snapshot().values)).toEqual([undefined, undefined]);
        assert.deepEqual(await page.evaluate(() => window.filterWrites), []);
      },
      { [loadingFlag]: true },
    ));
}
