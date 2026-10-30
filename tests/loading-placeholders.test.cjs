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
        import { stockFeatures } from '@tanstack/react-table';
        import { StrictMode, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { MantineProvider } from '@mantine/core';
        import { MantineReactTable, useMantineReactTable } from './src';
        const emptyData = [];
        window.calls = [];
        window.renderErrors = [];
        const record = (name, original) => {
          window.calls.push(name);
          return original.title.trim();
        };
        const rowPredicate = name => row => !!record(name, row.original);
        const accessorFn = original => record('accessor', original);
        const getUniqueValues = original => [record('unique', original)];
        const column = {
          id: 'title', header: 'Title',
          ...(window.config.inherited ? {} : { accessorFn, getUniqueValues }),
          filterFn: (row, id, value) => record('filter', row.original).includes(value),
          sortFn: (a, b) => record('sort', a.original).localeCompare(record('sort', b.original)),
          Cell: ({ row }) => record('Cell', row.original),
          enableEditing: rowPredicate('columnEditing'),
          enableClickToCopy: cell => !!record('columnCopy', cell.row.original),
          mantineTableBodyCellProps: window.config.staticProps ? { 'data-column': 'yes' }
            : ({ row }) => ({ title: record('columnProps', row.original) }),
        };
        const columns = [{ id: 'group', header: 'Group', columns: [column] }];
        window.virtualizer = { current: null };
        const options = {
          ...(window.config.virtualized ? { enableRowVirtualization: true,
            rowVirtualizerInstanceRef: window.virtualizer } : {}),
          ...(window.config.customFacets ? { features: {
            ...stockFeatures,
            facetedUniqueValues: (table, id) => {
              table.options.data.forEach(row => record('facetFactory', row));
              return () => new Map(table.options.data.map(row => [record('facetValue', row), 1]));
            },
          } } : {}),
          columns,
          enableFacetedValues: true,
          enableExpanding: true,
          enableTopToolbar: false,
          enableBottomToolbar: false,
          enableRowSelection: rowPredicate('select'),
          enableMultiRowSelection: rowPredicate('multiSelect'),
          enableSubRowSelection: rowPredicate('subSelect'),
          enableRowPinning: rowPredicate('pin'),
          getRowCanExpand: rowPredicate('expand'),
          getIsRowExpanded: rowPredicate('expanded'),
          getSubRows: original => { record('subRows', original); return original.children; },
          ...(window.config.defaultIds ? {} : { getRowId: original => record('rowId', original) }),
          enableEditing: rowPredicate('editing'),
          enableClickToCopy: cell => { record('copy', cell.row.original); return false; },
          renderDetailPanel: ({ row }) => record('detail', row.original),
          mantineTableBodyRowProps: window.config.staticProps ? { 'data-row': 'yes' }
            : ({ row }) => ({ title: record('rowProps', row.original) }),
          mantineTableBodyCellProps: window.config.staticProps ? { 'data-cell': 'yes' }
            : ({ row }) => ({ title: record('cellProps', row.original) }),
          mantineSkeletonProps: ({ column }) => ({ 'data-skeleton': column.id }),
          ...(window.config.inherited ? { defaultColumn: { accessorFn, getUniqueValues } } : {}),
          memoMode: window.config.memoMode,
          initialState: { pagination: { pageIndex: 0, pageSize: 3 } },
        };
        function Harness() {
          const [props, update] = useState({ isLoading: true });
          window.update = update;
          const table = useMantineReactTable({ ...options, data: props.data ?? emptyData,
            state: { isLoading: props.isLoading ?? false, showSkeletons: props.showSkeletons,
              sorting: props.sorting ?? [], columnFilters: props.columnFilters ?? [],
              expanded: true },
          });
          window.table = table;
          return window.config.headless ? <span>Ready</span> : <MantineReactTable table={table} />;
        }
        createRoot(document.getElementById('root'), {
          onUncaughtError: error => window.renderErrors.push(error.message),
        }).render(<StrictMode><MantineProvider><Harness /></MantineProvider></StrictMode>);
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
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
});
after(async () => browser?.close());

async function withTable(config, run) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setContent('<div id="root"></div>');
    await page.evaluate((config) => {
      window.config = config;
    }, config);
    await page.addScriptTag({ content: bundle });
    await expect.poll(() => page.evaluate(() => !!window.update)).toBe(true);
    await run(page);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.renderErrors), []);
  } finally {
    await page.close();
  }
}

for (const inherited of [false, true]) {
  test(`loading protects ${inherited ? 'inherited' : 'nested'} accessors, facets and row callbacks`, () =>
    withTable({ inherited, headless: true }, async (page) => {
      const inspect = () =>
        page.evaluate(() => {
          const table = window.table;
          const column = table.getColumn('title');
          column.getAutoSortDir();
          column.getAutoSortFn();
          const rows = table.getRowModel().rows;
          return {
            values: rows.map((row) => row.getValue('title')),
            unique: rows.map((row) => row.getUniqueValues('title')),
            ids: rows.map((row) => row.id),
            facets: [...column.getFacetedUniqueValues().keys()].sort(),
            facetRows: column.getFacetedRowModel().rows.length,
            minMax: column.getFacetedMinMaxValues(),
          };
        });
      assert.deepEqual(await inspect(), {
        values: [undefined, undefined, undefined],
        unique: [[], [], []],
        ids: ['mrt-skeleton-0', 'mrt-skeleton-1', 'mrt-skeleton-2'],
        facets: [],
        facetRows: 0,
        minMax: undefined,
      });
      assert.deepEqual(await page.evaluate(() => window.calls), []);
      await page.evaluate(() =>
        window.update({
          // Real data must work even while loading remains true.
          isLoading: true,
          data: [{ title: 'Zoo' }, { title: 'Beta' }, { title: 'Alpha' }],
          sorting: [{ id: 'title', desc: false }],
          columnFilters: [{ id: 'title', value: 'a' }],
        }),
      );
      await expect
        .poll(async () => (await inspect()).values)
        .toEqual(['Alpha', 'Beta']);
      assert.deepEqual((await inspect()).facets, ['Alpha', 'Beta', 'Zoo']);
      for (const name of [
        'accessor',
        'unique',
        'filter',
        'sort',
        'rowId',
        'subRows',
      ]) {
        assert.ok(
          (await page.evaluate(() => window.calls)).includes(name),
          name,
        );
      }
      await page.evaluate(() => {
        window.calls = [];
        window.update({ showSkeletons: true });
      });
      await expect
        .poll(async () => (await inspect()).ids)
        .toEqual(['mrt-skeleton-0', 'mrt-skeleton-1', 'mrt-skeleton-2']);
      assert.deepEqual(await page.evaluate(() => window.calls), []);
      await page.evaluate(() => window.update({ data: [] }));
      await expect.poll(async () => (await inspect()).values).toEqual([]);
    }));
}

test('rendering suppresses application callbacks only for placeholders', () =>
  withTable({}, async (page) => {
    await expect(page.locator('[data-skeleton="title"]')).toHaveCount(3);
    assert.deepEqual(await page.evaluate(() => window.calls), []);
    const capabilities = () =>
      page.evaluate(() => {
        const row = window.table.getCoreRowModel().rows[0];
        return [
          'getCanSelect',
          'getCanMultiSelect',
          'getCanSelectSubRows',
          'getCanPin',
          'getCanExpand',
        ].map((name) => row[name]());
      });
    assert.deepEqual(await capabilities(), [false, false, false, false, false]);
    await page.evaluate(() => window.update({ data: [{ title: 'Alpha' }] }));
    await expect(page.locator('[data-skeleton="title"]')).toHaveCount(0);
    assert.deepEqual(await capabilities(), [true, true, true, true, true]);
    const calls = await page.evaluate(() => window.calls);
    for (const name of [
      'Cell',
      'columnProps',
      'rowProps',
      'cellProps',
      'columnEditing',
      'editing',
      'columnCopy',
      'copy',
      'select',
      'multiSelect',
      'subSelect',
      'pin',
      'expand',
      'detail',
    ]) {
      assert.ok(calls.includes(name), `${name} must resume`);
    }
    await page.evaluate(() => {
      window.calls = [];
      window.update({ isLoading: true, data: [{ title: 'Beta' }] });
    });
    await expect
      .poll(() => page.evaluate(() => window.calls.includes('rowProps')))
      .toBe(true);
    await page.evaluate(() => {
      window.calls = [];
      window.update({ isLoading: true, showSkeletons: false });
    });
    await expect(page.locator('tbody > tr')).toHaveCount(3);
    await expect(page.locator('tbody')).toHaveText('');
    assert.deepEqual(await page.evaluate(() => window.calls), []);
  }));

for (const memoMode of ['cells', 'rows']) {
  test(`memoized ${memoMode} preserve skeleton styles and update visibility`, () =>
    withTable({ staticProps: true, memoMode }, async (page) => {
      await expect(page.locator('[data-skeleton="title"]')).toHaveCount(3);
      await expect(page.locator('[data-row="yes"]')).toHaveCount(3);
      await expect(
        page.locator('[data-cell="yes"][data-column="yes"]'),
      ).toHaveCount(3);
      for (const showSkeletons of [false, true, false]) {
        await page.evaluate(
          (showSkeletons) => window.update({ isLoading: true, showSkeletons }),
          showSkeletons,
        );
        await expect(page.locator('[data-skeleton="title"]')).toHaveCount(
          showSkeletons ? 3 : 0,
        );
      }
      assert.deepEqual(await page.evaluate(() => window.calls), []);
    }));
}

test('repeated loading restores default hierarchical row IDs and expansion', () =>
  withTable({ headless: true, defaultIds: true }, async (page) => {
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.evaluate(() =>
        window.update({
          data: [
            { title: 'Alpha', children: [{ title: 'Child A' }] },
            { title: 'Beta', children: [{ title: 'Child B' }] },
          ],
        }),
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.table.getCoreRowModel().flatRows.map((row) => row.id),
          ),
        )
        .toEqual(['0', '0.0', '1', '1.0']);
      assert.equal(
        await page.evaluate(() => window.table.getRow('1.0').original.title),
        'Child B',
      );
      await page.evaluate(() => window.update({ showSkeletons: true }));
      await expect
        .poll(() =>
          page.evaluate(() => window.table.getCoreRowModel().rows[0].id),
        )
        .toBe('mrt-skeleton-0');
    }
  }));

test('invalid real application data still raises callback errors', () =>
  withTable({ headless: true }, async (page) => {
    await page.evaluate(() => window.update({ data: [{ title: 'Alpha' }] }));
    await expect
      .poll(() => page.evaluate(() => window.table.options.data.length))
      .toBe(1);
    const error = await page.evaluate(() => {
      try {
        const row = window.table.getCoreRowModel().rows[0];
        row.original.title = null;
        row.getValue('title');
      } catch (error) {
        return { name: error.name, message: error.message };
      }
    });
    assert.equal(error?.name, 'TypeError');
    assert.match(error.message, /trim/);
  }));

test('custom facet factories skip placeholders and resume for real data', () =>
  withTable({ headless: true, customFacets: true }, async (page) => {
    const facets = () =>
      page.evaluate(() => [
        ...window.table.getColumn('title').getFacetedUniqueValues().keys(),
      ]);
    assert.deepEqual(await facets(), []);
    assert.deepEqual(await page.evaluate(() => window.calls), []);
    await page.evaluate(() => window.update({ data: [{ title: 'Alpha' }] }));
    await expect.poll(facets).toEqual(['Alpha']);
    assert.ok(
      (await page.evaluate(() => window.calls)).includes('facetFactory'),
    );
    await page.evaluate(() => {
      window.calls = [];
      window.update({ showSkeletons: true });
    });
    await expect.poll(facets).toEqual([]);
    assert.deepEqual(await page.evaluate(() => window.calls), []);
  }));

test('virtualized placeholders reserve no space for expanded detail panels', () =>
  withTable({ virtualized: true }, async (page) => {
    await expect
      .poll(() => page.evaluate(() => !!window.virtualizer.current))
      .toBe(true);
    assert.equal(
      await page.evaluate(() =>
        window.virtualizer.current.options.estimateSize(1),
      ),
      0,
    );
    assert.deepEqual(await page.evaluate(() => window.calls), []);
    await page.evaluate(() => window.update({ data: [{ title: 'Alpha' }] }));
    await expect
      .poll(() =>
        page.evaluate(() => window.virtualizer.current.options.estimateSize(1)),
      )
      .toBe(100);
  }));

test('placeholder count follows page size changes', () =>
  withTable({ headless: true }, async (page) => {
    await page.evaluate(() => window.table.setPageSize(5));
    await expect
      .poll(() =>
        page.evaluate(() => window.table.getCoreRowModel().rows.length),
      )
      .toBe(5);
    await page.evaluate(() => window.table.setPageSize(50));
    await expect
      .poll(() =>
        page.evaluate(() => window.table.getCoreRowModel().rows.length),
      )
      .toBe(20);
    assert.deepEqual(await page.evaluate(() => window.calls), []);
  }));
