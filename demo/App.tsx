import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Alert,
  AppShell,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core'

import { MantineReactTable, useMantineReactTable } from '../src'
import { employees, queryEmployees } from './mockServer'
import { readUrlState, writeUrlState } from './urlState'
import type { Employee } from './mockServer'
import type {
  MRT_ColumnDef,
  MRT_ColumnFiltersState,
  MRT_PaginationState,
  MRT_SortingState,
} from '../src'

const initialUrlState = readUrlState()
const infinitePageSize = 40

const parseDayMonthYear = (value: string) => {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (!match) return null
  const date = new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
  )
  return date.getFullYear() === Number(match[3]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[1])
    ? date
    : null
}

export function App() {
  const [dataMode, setDataMode] = useState<'client' | 'server'>(
    initialUrlState.navigation === 'infinite'
      ? 'server'
      : initialUrlState.dataMode,
  )
  const [navigation, setNavigation] = useState<'infinite' | 'pagination'>(
    initialUrlState.navigation,
  )
  const [urlStateEnabled, setUrlStateEnabled] = useState(
    initialUrlState.urlStateEnabled,
  )
  const [forceLoading, setForceLoading] = useState(false)
  const [forceError, setForceError] = useState(false)
  const [latency, setLatency] = useState(500)
  const [columnFilters, setColumnFilters] = useState<MRT_ColumnFiltersState>(
    initialUrlState.columnFilters,
  )
  const [globalFilter, setGlobalFilter] = useState(initialUrlState.globalFilter)
  const [pagination, setPagination] = useState<MRT_PaginationState>(
    initialUrlState.pagination,
  )
  const [sorting, setSorting] = useState<MRT_SortingState>(
    initialUrlState.sorting,
  )
  const [infinitePage, setInfinitePage] = useState(0)
  const [rows, setRows] = useState<Employee[]>([])
  const [rowCount, setRowCount] = useState(0)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [requestVersion, setRequestVersion] = useState(0)
  const requestId = useRef(0)

  const columns = useMemo<MRT_ColumnDef<Employee>[]>(
    () => [
      { accessorKey: 'id', header: 'Employee ID', size: 110 },
      { accessorKey: 'name', header: 'Name', size: 180 },
      {
        accessorKey: 'department',
        filterVariant: 'multi-select',
        header: 'Department',
        mantineFilterMultiSelectProps: {
          data: ['Engineering', 'Finance', 'Legal', 'Operations'],
          clearButtonProps: { 'aria-label': 'Clear departments' },
          withScrollArea: false,
        },
      },
      {
        accessorKey: 'salary',
        filterVariant: 'range',
        header: 'Salary',
        Cell: ({ cell }) =>
          new Intl.NumberFormat('en-AU', {
            currency: 'AUD',
            maximumFractionDigits: 0,
            style: 'currency',
          }).format(cell.getValue<number>()),
      },
      {
        accessorKey: 'hiredAt',
        filterVariant: 'date-range',
        header: 'Hired',
        mantineFilterDateInputProps: {
          dateParser: parseDayMonthYear,
          valueFormat: 'DD/MM/YYYY',
        },
        sortingFn: 'datetime',
        Cell: ({ cell }) => cell.getValue<Date>().toLocaleDateString('en-AU'),
      },
    ],
    [],
  )

  const queryKey = JSON.stringify({
    columnFilters,
    dataMode,
    globalFilter,
    navigation,
    sorting,
  })

  useEffect(() => {
    if (navigation !== 'infinite') return
    setInfinitePage(0)
    setRows([])
  }, [queryKey, navigation])

  useEffect(() => {
    writeUrlState({
      columnFilters,
      dataMode,
      globalFilter,
      navigation,
      pagination,
      sorting,
      urlStateEnabled,
    })
  }, [
    columnFilters,
    dataMode,
    globalFilter,
    navigation,
    pagination,
    sorting,
    urlStateEnabled,
  ])

  useEffect(() => {
    const currentRequest = ++requestId.current
    setIsFetching(true)
    setError(undefined)

    const requestPagination =
      navigation === 'infinite'
        ? { pageIndex: infinitePage, pageSize: infinitePageSize }
        : dataMode === 'server'
          ? pagination
          : { pageIndex: 0, pageSize: employees.length }

    void queryEmployees({
      columnFilters: dataMode === 'server' ? columnFilters : [],
      fail: forceError,
      globalFilter: dataMode === 'server' ? globalFilter : '',
      latency,
      pagination: requestPagination,
      sorting: dataMode === 'server' ? sorting : [],
    })
      .then((response) => {
        if (currentRequest !== requestId.current) return
        setRows((currentRows) =>
          navigation === 'infinite' && infinitePage > 0
            ? [
                ...currentRows.slice(0, infinitePage * infinitePageSize),
                ...response.rows,
              ]
            : response.rows,
        )
        setRowCount(response.rowCount)
      })
      .catch((requestError: Error) => {
        if (currentRequest !== requestId.current) return
        setRows([])
        setRowCount(0)
        setError(requestError)
      })
      .finally(() => {
        if (currentRequest === requestId.current) setIsFetching(false)
      })
  }, [
    columnFilters,
    dataMode,
    forceError,
    globalFilter,
    infinitePage,
    latency,
    navigation,
    pagination,
    requestVersion,
    sorting,
  ])

  const initialLoading = isFetching && rows.length === 0 && !error
  const showLoading = initialLoading || forceLoading
  const serverMode = dataMode === 'server'

  const table = useMantineReactTable({
    columns,
    data: rows,
    autoResetPageIndex: false,
    columnFilterDisplayMode: 'subheader',
    enableColumnFilters: true,
    enableGlobalFilter: true,
    enablePagination: navigation === 'pagination',
    enableRowVirtualization: navigation === 'infinite',
    manualFiltering: serverMode,
    manualPagination: serverMode,
    manualSorting: serverMode,
    rowCount: serverMode ? rowCount : undefined,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    positionToolbarAlertBanner: 'top',
    mantineTableContainerProps: {
      onScroll: (event) => {
        if (navigation !== 'infinite' || isFetching || rows.length >= rowCount)
          return
        const container = event.currentTarget
        const nearBottom =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          160
        if (nearBottom) setInfinitePage((page) => page + 1)
      },
      style: { maxHeight: navigation === 'infinite' ? 520 : undefined },
    },
    mantineToolbarAlertBannerProps: {
      color: 'red',
      children: (
        <Group>
          <Text size="sm">
            {error?.message ?? 'The mock server rejected the request'}
          </Text>
          <Button
            size="compact-xs"
            variant="light"
            onClick={() => {
              setForceError(false)
              setInfinitePage(0)
              setRequestVersion((version) => version + 1)
            }}
          >
            Retry
          </Button>
        </Group>
      ),
    },
    state: {
      columnFilters,
      globalFilter,
      isLoading: showLoading,
      pagination,
      showAlertBanner: Boolean(error),
      showProgressBars: isFetching && !initialLoading,
      sorting,
    },
    initialState: {
      density: 'xs',
      pagination: { pageIndex: 0, pageSize: 20 },
      showColumnFilters: true,
    },
  })

  const visibleRows = table.getRowModel().rows.length
  const status = error
    ? 'Error'
    : showLoading
      ? 'Loading'
      : `Showing ${visibleRows} rows${serverMode ? ` of ${rowCount}` : ''}`

  return (
    <AppShell header={{ height: 68 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <div>
            <Title order={2}>Mantine React Table playground</Title>
            <Text c="dimmed" size="sm">
              Async client and mock-server behaviour
            </Text>
          </div>
          <Badge
            data-testid="table-status"
            color={error ? 'red' : showLoading ? 'blue' : 'green'}
          >
            {status}
          </Badge>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          <Stack gap="md">
            <Paper withBorder p="md">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                <Stack gap={6}>
                  <Text fw={600} size="sm">
                    Data processing
                  </Text>
                  <SegmentedControl
                    aria-label="Data processing"
                    data={[
                      {
                        label: 'Client',
                        value: 'client',
                        disabled: navigation === 'infinite',
                      },
                      { label: 'Mock server', value: 'server' },
                    ]}
                    value={dataMode}
                    onChange={(value) =>
                      setDataMode(value as 'client' | 'server')
                    }
                  />
                </Stack>
                <Stack gap={6}>
                  <Text fw={600} size="sm">
                    Navigation
                  </Text>
                  <SegmentedControl
                    aria-label="Navigation"
                    data={[
                      { label: 'Pagination', value: 'pagination' },
                      { label: 'Infinite scroll', value: 'infinite' },
                    ]}
                    value={navigation}
                    onChange={(value) => {
                      const next = value as 'infinite' | 'pagination'
                      setNavigation(next)
                      if (next === 'infinite') setDataMode('server')
                    }}
                  />
                </Stack>
                <Stack gap={6}>
                  <Text fw={600} size="sm">
                    Mock latency
                  </Text>
                  <SegmentedControl
                    aria-label="Mock latency"
                    data={[
                      { label: '100 ms', value: '100' },
                      { label: '500 ms', value: '500' },
                      { label: '1.2 s', value: '1200' },
                    ]}
                    value={String(latency)}
                    onChange={(value) => setLatency(Number(value))}
                  />
                </Stack>
                <Switch
                  label="Store filter, pagination and sort state in the URL"
                  checked={urlStateEnabled}
                  onChange={(event) =>
                    setUrlStateEnabled(event.currentTarget.checked)
                  }
                />
                <Switch
                  label="Force loading state"
                  checked={forceLoading}
                  onChange={(event) =>
                    setForceLoading(event.currentTarget.checked)
                  }
                />
                <Switch
                  label="Force error response"
                  checked={forceError}
                  onChange={(event) =>
                    setForceError(event.currentTarget.checked)
                  }
                />
              </SimpleGrid>
            </Paper>

            {navigation === 'infinite' && (
              <Alert color="blue" variant="light">
                Infinite scrolling uses the mock server so filtering and sorting
                remain correct across unloaded rows.
              </Alert>
            )}

            <MantineReactTable table={table} />
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
