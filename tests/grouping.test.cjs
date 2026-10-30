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
        import { MantineProvider } from '@mantine/core';
        import { MantineReactTable, useMantineReactTable } from './src';
        const data = [
          { id: 'a', team: 'North', category: 'A', amount: 10 },
          { id: 'b', team: 'North', category: 'B', amount: 20 },
          { id: 'c', team: 'South', category: 'A', amount: 40 },
          { id: 'd', team: 'South', category: 'A', amount: 50 },
        ];
        window.writes = [];
        window.acceptChanges = true;
        window.groupingCalls = 0;
        window.aggregateCalls = 0;
        const columns = [
          { accessorKey: 'id', header: 'ID', enableGrouping: false },
          { accessorKey: 'team', header: 'Team',
            getGroupingValue: original => { window.groupingCalls++; return original.team.trim(); },
            GroupedCell: ({ cell, row }) => 'Team ' + cell.getValue() + ' (' + row.getLeafRows().filter(leaf => !leaf.getIsGrouped()).length + ')',
          },
          { accessorKey: 'category', header: 'Category' },
          { accessorKey: 'amount', header: 'Amount', filterFn: 'greaterThan',
            aggregationFn: window.config.multipleAggregations ? ['sum', 'mean', 'count'] : window.config.customAggregation
              ? { aggregate: ({ rows, getValue }) => { window.aggregateCalls++; return rows.reduce((sum, row) => sum + getValue(row), 0); } }
              : 'sum',
            AggregatedCell: ({ cell }) => window.config.multipleAggregations
              ? 'Sum ' + cell.getValue().sum + ', mean ' + cell.getValue().mean + ', count ' + cell.getValue().count
              : 'Total ' + cell.getValue(),
            Cell: ({ cell }) => 'Value ' + cell.getValue(),
          },
        ];
        function Harness() {
          const [rows, setData] = useState(window.config.loading ? [] : data);
          const [state, setState] = useState({
            isLoading: !!window.config.loading,
            ...(window.config.controlled ? { grouping: ['category'] } : {}),
          });
          window.setState = setState;
          window.setData = setData;
          window.records = data;
          const table = useMantineReactTable({
            columns, data: rows, state,
            enableGrouping: true,
            enableGlobalFilterRankedResults: false,
            autoResetPageIndex: false,
            enableTopToolbar: false,
            enableBottomToolbar: false,
            getRowId: row => row.id,
            initialState: { grouping: window.config.nested ? ['team', 'category'] : ['team'],
              expanded: false, pagination: { pageIndex: 0, pageSize: 10 } },
            ...(window.config.controlled ? {
              onGroupingChange: updater => {
                window.writes.push(typeof updater);
                if (window.acceptChanges) setState(previous => ({ ...previous,
                  grouping: typeof updater === 'function' ? updater(previous.grouping) : updater }));
              },
            } : {}),
          });
          window.table = table;
          window.groups = () => {
            const summarize = row => ({ id: row.id, grouped: row.getIsGrouped(),
              amount: row.getValue('amount'), leaves: row.getLeafRows().filter(leaf => !leaf.getIsGrouped()).map(leaf => leaf.original.id),
              children: row.subRows.filter(child => child.getIsGrouped()).map(summarize) });
            return table.getGroupedRowModel().rows.map(summarize);
          };
          return <MantineReactTable table={table} />;
        }
        createRoot(document.getElementById('root')).render(
          <StrictMode><MantineProvider><Harness /></MantineProvider></StrictMode>);
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
    await expect(page.getByRole('table')).toBeVisible();
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

for (const customAggregation of [false, true]) {
  test(`${customAggregation ? 'custom' : 'built-in'} aggregates render and group rows expand and collapse`, () =>
    withTable({ customAggregation }, async (page) => {
      await expect(
        page.getByRole('cell', { name: 'Team North (2)', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('cell', { name: 'Total 30', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('cell', { name: 'Total 90', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('cell', { name: 'Value 10', exact: true }),
      ).toHaveCount(0);
      const group = page.getByRole('row').filter({ hasText: 'Team North' });
      await group.getByRole('button', { name: 'Expand', exact: true }).click();
      await expect(
        page.getByRole('cell', { name: 'Value 10', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('cell', { name: 'Value 20', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('cell', { name: 'Value 40', exact: true }),
      ).toHaveCount(0);
      await group.getByRole('button', { name: 'Expand', exact: true }).click();
      await expect(
        page.getByRole('cell', { name: 'Value 10', exact: true }),
      ).toHaveCount(0);
    }));
}

for (const customAggregation of [false, true]) {
  test(`nested grouping preserves ${customAggregation ? 'custom' : 'built-in'} totals and leaf membership`, () =>
    withTable({ nested: true, customAggregation }, async (page) => {
      const groups = await page.evaluate(() => window.groups());
      assert.deepEqual(
        groups.map((group) => ({
          amount: group.amount,
          leaves: group.leaves,
          children: group.children.map((child) => ({
            amount: child.amount,
            leaves: child.leaves,
          })),
        })),
        [
          {
            amount: 30,
            leaves: ['a', 'b'],
            children: [
              { amount: 10, leaves: ['a'] },
              { amount: 20, leaves: ['b'] },
            ],
          },
          {
            amount: 90,
            leaves: ['c', 'd'],
            children: [{ amount: 90, leaves: ['c', 'd'] }],
          },
        ],
      );
      await page.evaluate(() => window.table.setExpanded(true));
      for (const amount of [10, 20, 40, 50]) {
        await expect(
          page.getByRole('cell', { name: 'Value ' + amount, exact: true }),
        ).toBeVisible();
      }
    }));
}

test('filtering recalculates group totals and sorting orders groups by aggregate', () =>
  withTable({}, async (page) => {
    await page.evaluate(() => {
      window.table.setColumnFilters([{ id: 'amount', value: 15 }]);
      window.table.setSorting([{ id: 'amount', desc: true }]);
    });
    await expect(
      page.getByRole('cell', { name: 'Total 20', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.table
            .getSortedRowModel()
            .rows.map((row) => row.getValue('amount')),
        ),
      )
      .toEqual([90, 20]);
    assert.deepEqual(
      await page.evaluate(() => window.groups().map((group) => group.leaves)),
      [['b'], ['c', 'd']],
    );
    await page.evaluate(() => window.table.setColumnFilters([]));
    await expect(
      page.getByRole('cell', { name: 'Total 30', exact: true }),
    ).toBeVisible();
  }));

test('collapsed groups paginate and clearing grouping restores leaf rows', () =>
  withTable({}, async (page) => {
    await page.evaluate(() => window.table.setPageSize(1));
    await expect(
      page.getByRole('cell', { name: 'Team North (2)', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Team South (2)', exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => window.table.nextPage());
    await expect(
      page.getByRole('cell', { name: 'Team South (2)', exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.table.setPageIndex(0);
      window.table.setPageSize(10);
      window.table.setGrouping([]);
    });
    await expect(
      page.getByRole('cell', { name: 'Total 30', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('cell', { name: 'Value 10', exact: true }),
    ).toBeVisible();
    assert.deepEqual(
      await page.evaluate(() =>
        window.table.getRowModel().rows.map((row) => row.id),
      ),
      ['a', 'b', 'c', 'd'],
    );
    await page.evaluate(() => window.table.resetGrouping());
    await expect(
      page.getByRole('cell', { name: 'Total 30', exact: true }),
    ).toBeVisible();
  }));

test('grouping and aggregation resume after repeated placeholder loading', () =>
  withTable({ loading: true, customAggregation: true }, async (page) => {
    assert.equal(await page.evaluate(() => window.groupingCalls), 0);
    assert.equal(await page.evaluate(() => window.aggregateCalls), 0);
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.evaluate(() => {
        window.setData(window.records);
        window.setState({ isLoading: false });
      });
      await expect(
        page.getByRole('cell', { name: 'Total 90', exact: true }),
      ).toBeVisible();
      await page.evaluate(() => {
        window.setData([]);
        window.setState({ showSkeletons: true });
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.table.getRowModel().rows.every((row) => !row.getIsGrouped()),
          ),
        )
        .toBe(true);
    }
  }));

test('controlled grouping overrides initial defaults and follows external replacements', () =>
  withTable({ controlled: true }, async (page) => {
    await expect
      .poll(() => page.evaluate(() => window.table.getState().grouping))
      .toEqual(['category']);
    assert.deepEqual(
      await page.evaluate(() => window.groups().map((group) => group.amount)),
      [100, 20],
    );
    assert.deepEqual(await page.evaluate(() => window.writes), []);
    await page.evaluate(() =>
      window.setState({ grouping: ['team', 'category'] }),
    );
    await expect
      .poll(() => page.evaluate(() => window.table.getState().grouping))
      .toEqual(['team', 'category']);
    assert.equal(
      (await page.evaluate(() => window.groups()))[0].children.length,
      2,
    );
    await page.evaluate(() => {
      window.acceptChanges = false;
      window.table.setGrouping([]);
    });
    assert.deepEqual(
      await page.evaluate(() => window.table.getState().grouping),
      ['team', 'category'],
    );
    assert.equal((await page.evaluate(() => window.writes)).length, 1);
    await page.evaluate(() => {
      window.acceptChanges = true;
      window.table.setGrouping((previous) => previous.slice(0, 1));
    });
    await expect
      .poll(() => page.evaluate(() => window.table.getState().grouping))
      .toEqual(['team']);
  }));

test('multiple aggregations remain named and recompute after filtering', () =>
  withTable({ multipleAggregations: true }, async (page) => {
    await expect(
      page.getByRole('cell', { name: 'Sum 30, mean 15, count 2', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Sum 90, mean 45, count 2', exact: true }),
    ).toBeVisible();
    await page.evaluate(() =>
      window.table.setColumnFilters([{ id: 'amount', value: 15 }]),
    );
    await expect(
      page.getByRole('cell', { name: 'Sum 20, mean 20, count 1', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Sum 90, mean 45, count 2', exact: true }),
    ).toBeVisible();
  }));
