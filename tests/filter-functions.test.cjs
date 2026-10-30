const { before, test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');

// Exercise local calendar boundaries, including both daylight-saving changes.
process.env.TZ = 'Australia/Sydney';
let filters;
let queryEmployees;
before(async () => {
  const result = await build({
    stdin: {
      contents: `export { MRT_FilterFns } from './src/fns/filterFns'; export { queryEmployees } from './demo/mockServer';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(
    module,
    module.exports,
    require,
  );
  filters = module.exports.MRT_FilterFns;
  queryEmployees = module.exports.queryEmployees;
});

const row = (value) => ({ getValue: () => value });
const matches = (date, bounds) =>
  filters.betweenInclusive(row(new Date(date)), 'date', bounds);

test('date ranges accept empty, null, and undefined open bounds', () => {
  for (const empty of ['', null, undefined]) {
    assert.equal(matches('2024-06-15T12:00:00', ['2024-01-01', empty]), true);
    assert.equal(matches('2023-12-31T23:59:59', ['2024-01-01', empty]), false);
    assert.equal(matches('2024-06-15T12:00:00', [empty, '2024-12-31']), true);
    assert.equal(matches('2025-01-01T00:00:00', [empty, '2024-12-31']), false);
  }
});

test('inclusive date-only bounds include the whole local day across DST', () => {
  for (const [day, nextDay] of [
    ['2024-04-07', '2024-04-08'],
    ['2024-10-06', '2024-10-07'],
    ['2024-06-15', '2024-06-16'],
  ]) {
    assert.equal(matches(`${day}T00:00:00`, [day, day]), true);
    assert.equal(matches(`${day}T23:59:59.999`, [day, day]), true);
    assert.equal(matches(`${nextDay}T00:00:00`, [day, day]), false);
  }
});

test('timestamp bounds remain exact rather than gaining an extra day', () => {
  const cutoff = new Date('2024-06-15T12:00:00');
  for (const maximum of [cutoff, cutoff.getTime(), cutoff.toISOString()]) {
    assert.equal(matches('2024-06-15T12:00:00', ['', maximum]), true);
    assert.equal(matches('2024-06-15T12:00:00.001', ['', maximum]), false);
  }
});

test('date comparison modes agree on equality and ordering', () => {
  const date = row(new Date('2024-01-01T00:00:00'));
  assert.equal(filters.equals(date, 'date', '2024-01-01'), true);
  assert.equal(filters.notEquals(date, 'date', '2024-01-01'), false);
  assert.equal(filters.notEquals(date, 'date', '2024-01-02'), true);
  assert.equal(filters.lessThan(date, 'date', '2024-01-02'), true);
  assert.equal(filters.greaterThan(date, 'date', '2023-12-31'), true);
  assert.equal(filters.lessThanOrEqualTo(date, 'date', '2024-01-01'), true);
  assert.equal(filters.greaterThanOrEqualTo(date, 'date', '2024-01-01'), true);
});

test('numeric ranges preserve zero, open bounds, and reversed-bound behavior', () => {
  assert.equal(filters.betweenInclusive(row(0), 'number', [0, 10]), true);
  assert.equal(filters.betweenInclusive(row(-1), 'number', [0, '']), false);
  assert.equal(
    filters.betweenInclusive(row(10), 'number', [undefined, 10]),
    true,
  );
  assert.equal(filters.betweenInclusive(row(11), 'number', ['', 10]), false);
  assert.equal(filters.betweenInclusive(row(30), 'number', [20, 10]), true);
});

test('mock server date-only bounds use the same local calendar as client filters', async () => {
  const response = await queryEmployees({
    columnFilters: [{ id: 'hiredAt', value: ['2024-07-13', '2024-07-13'] }],
    fail: false,
    globalFilter: '',
    latency: 0,
    pagination: { pageIndex: 0, pageSize: 240 },
    sorting: [],
  });
  assert.equal(response.rowCount, 2);
  for (const employee of response.rows) {
    assert.equal(employee.hiredAt.getTime(), new Date(2024, 6, 13).getTime());
  }
});
