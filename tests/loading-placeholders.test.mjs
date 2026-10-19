import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// React DOM needs a DOM before it is imported.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
})
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { act, createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const { MantineProvider } = await import('@mantine/core')
const { useMantineReactTable } = await import('../dist/index.js')

const createHarness = (columns, extraOptions = {}) => {
  const node = document.createElement('div')
  document.body.append(node)
  const root = createRoot(node)
  let table

  function TableHarness({ data, isLoading, sorting = [], columnFilters = [] }) {
    table = useMantineReactTable({
      columns,
      data,
      enableFacetedValues: true,
      ...extraOptions,
      initialState: { pagination: { pageIndex: 0, pageSize: 3 } },
      state: { isLoading, sorting, columnFilters },
    })
    return null
  }

  return {
    async render(props) {
      await act(async () => {
        root.render(
          createElement(
            MantineProvider,
            null,
            createElement(TableHarness, props),
          ),
        )
      })
      return table
    },
    async cleanup() {
      await act(async () => root.unmount())
      node.remove()
    },
  }
}

test('initial loading renders skeletons without running user accessors, sort, filter, or facets', async () => {
  const accessorCalls = []
  let filterCalls = 0
  let sortCalls = 0
  let uniqueCalls = 0
  let getRowIdCalls = 0
  let getSubRowsCalls = 0
  const columns = [
    {
      id: 'title',
      header: 'Title',
      accessorFn: (row) => {
        accessorCalls.push(row)
        return row.title.replace(/^X:/, '')
      },
      getUniqueValues: (row) => {
        uniqueCalls++
        return [row.title.toLowerCase()]
      },
      filterFn: (row, id, value) => {
        filterCalls++
        return String(row.getValue(id)).includes(String(value))
      },
      sortFn: (a, b, id) => {
        sortCalls++
        return String(a.getValue(id)).localeCompare(String(b.getValue(id)))
      },
    },
  ]
  const harness = createHarness(columns, {
    getRowId: (row) => {
      getRowIdCalls++
      return row.title.replace(/^X:/, '')
    },
    getSubRows: (row) => {
      getSubRowsCalls++
      return row.title ? row.subRows : undefined
    },
  })
  try {
    const table = await harness.render({
      data: [],
      isLoading: true,
      sorting: [{ id: 'title', desc: false }],
      columnFilters: [{ id: 'title', value: 'Alpha' }],
    })
    const column = table.getColumn('title')
    assert.equal(table.getRowModel().rows.length, 3)
    assert.equal(table.getCoreRowModel().rows.length, 3)
    assert.doesNotThrow(() => column.getAutoSortDir())
    assert.doesNotThrow(() => column.getAutoSortFn())
    assert.equal(table.getRowModel().rows[0].getValue('title'), undefined)
    assert.deepEqual(table.getRowModel().rows[0].getUniqueValues('title'), [])
    assert.equal(table.getRowModel().rows[0].id, 'mrt-skeleton-0')
    assert.equal(column.getFacetedRowModel().rows.length, 0)
    assert.equal(column.getFacetedUniqueValues().size, 0)
    assert.equal(column.getFacetedMinMaxValues(), undefined)
    assert.equal(accessorCalls.length, 0)
    assert.equal(filterCalls, 0)
    assert.equal(sortCalls, 0)
    assert.equal(uniqueCalls, 0)
    assert.equal(getRowIdCalls, 0)
    assert.equal(getSubRowsCalls, 0)
    assert.equal(table.options.manualFiltering, true)
    assert.equal(table.options.manualSorting, true)
    assert.equal(table.options.enableFacetedValues, false)
    assert.equal(columns[0].accessorFn({ title: 'X:Original' }), 'Original')

    // User-defined row helpers must be restored for actual data.
    const populated = await harness.render({
      data: [{ title: 'X:Alpha' }],
      isLoading: false,
    })
    assert.equal(populated.getRowModel().rows[0].id, 'Alpha')
    assert.ok(getRowIdCalls > 0)
    assert.ok(getSubRowsCalls > 0)
  } finally {
    await harness.cleanup()
  }
})

test('rows arriving after initial loading restore real accessors, filtering, sorting, and faceting', async () => {
  const seenRows = []
  let filterCalls = 0
  let sortCalls = 0
  const columns = [
    {
      id: 'title',
      header: 'Title',
      accessorFn: (row) => {
        seenRows.push(row)
        return row.title.replace(/^X:/, '')
      },
      filterFn: (row, id, value) => {
        filterCalls++
        return String(row.getValue(id))
          .toLowerCase()
          .includes(String(value).toLowerCase())
      },
      sortFn: (a, b, id) => {
        sortCalls++
        return String(a.getValue(id)).localeCompare(String(b.getValue(id)))
      },
    },
  ]
  const harness = createHarness(columns)
  try {
    const loading = await harness.render({ data: [], isLoading: true })
    assert.equal(loading.getRowModel().rows.length, 3)
    assert.equal(seenRows.length, 0)

    const data = [
      { title: 'X:Zoo' },
      { title: 'X:Beta' },
      { title: 'X:Alpha' },
    ]
    const loaded = await harness.render({
      data,
      isLoading: false,
      sorting: [{ id: 'title', desc: false }],
      columnFilters: [{ id: 'title', value: 'a' }],
    })
    assert.notEqual(loaded.options.manualFiltering, true)
    assert.notEqual(loaded.options.manualSorting, true)
    assert.equal(loaded.options.enableFacetedValues, true)
    assert.equal(loaded.getColumn('title').getAutoSortDir(), 'asc')
    assert.deepEqual(
      loaded.getRowModel().rows.map((row) => row.getValue('title')),
      ['Alpha', 'Beta'],
    )
    assert.ok(seenRows.length > 0)
    assert.ok(seenRows.every((row) => data.includes(row)))
    assert.ok(filterCalls > 0)
    assert.ok(sortCalls > 0)
    assert.deepEqual(
      [...loaded.getColumn('title').getFacetedUniqueValues().keys()].sort(),
      ['Alpha', 'Beta', 'Zoo'],
    )

    // Returning to an empty non-loading table must not retain skeleton rows.
    const empty = await harness.render({ data: [], isLoading: false })
    assert.equal(empty.getRowModel().rows.length, 0)
  } finally {
    await harness.cleanup()
  }
})

test('nested custom accessors are bypassed only for skeleton rows; real data errors propagate', async () => {
  let calls = 0
  const columns = [
    {
      id: 'group',
      header: 'Group',
      columns: [
        {
          id: 'normalized',
          header: 'Normalized',
          accessorFn: (row) => {
            calls++
            return row.title.replace(/\s+/g, ' ').trim()
          },
        },
      ],
    },
  ]
  const harness = createHarness(columns)
  try {
    const loading = await harness.render({ data: [], isLoading: true })
    assert.equal(loading.getRowModel().rows[0].getValue('normalized'), undefined)
    assert.doesNotThrow(() => loading.getColumn('normalized').getAutoSortDir())
    assert.equal(calls, 0)

    const valid = await harness.render({
      data: [{ title: 'a   b' }],
      isLoading: false,
    })
    assert.equal(valid.getCoreRowModel().rows[0].getValue('normalized'), 'a b')
    assert.equal(calls, 1)

    const invalid = await harness.render({ data: [{}], isLoading: false })
    assert.throws(
      () => invalid.getCoreRowModel().rows[0].getValue('normalized'),
      TypeError,
    )
  } finally {
    await harness.cleanup()
  }
})
