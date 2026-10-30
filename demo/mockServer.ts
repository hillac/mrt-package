import type {
  MRT_ColumnFiltersState,
  MRT_PaginationState,
  MRT_SortingState,
} from '../src'

export type Employee = {
  id: number
  name: string
  department: 'Engineering' | 'Finance' | 'Legal' | 'Operations'
  salary: number
  hiredAt: Date
}

export type MockRequest = {
  columnFilters: MRT_ColumnFiltersState
  fail: boolean
  globalFilter: string
  latency: number
  pagination: MRT_PaginationState
  sorting: MRT_SortingState
}

export type MockResponse = {
  rows: Employee[]
  rowCount: number
}

const firstNames = [
  'Ava',
  'Chloe',
  'Ethan',
  'Harper',
  'Leo',
  'Mia',
  'Noah',
  'Sofia',
]
const lastNames = [
  'Brown',
  'Chen',
  'Garcia',
  'Jones',
  'Khan',
  'Nguyen',
  'Smith',
  'Wilson',
]
const departments: Employee['department'][] = [
  'Engineering',
  'Finance',
  'Legal',
  'Operations',
]

export const employees: Employee[] = Array.from(
  { length: 240 },
  (_, index) => ({
    id: index + 1,
    name: `${firstNames[index % firstNames.length]} ${lastNames[(index * 3) % lastNames.length]}`,
    department: departments[index % departments.length],
    salary: 55_000 + ((index * 7_913) % 125_000),
    hiredAt: new Date(
      2018 + (index % 8),
      (index * 5) % 12,
      1 + ((index * 11) % 27),
    ),
  }),
)

const asDate = (value: unknown) => {
  if (!value) return undefined
  const dateOnly =
    typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : dateOnly
        ? new Date(
            Number(dateOnly[1]),
            Number(dateOnly[2]) - 1,
            Number(dateOnly[3]),
          )
        : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

const inText = (value: string, filter: unknown) =>
  value.toLocaleLowerCase().includes(String(filter).toLocaleLowerCase())

const applyColumnFilters = (
  rows: Employee[],
  filters: MRT_ColumnFiltersState,
) =>
  filters.reduce((filteredRows, filter) => {
    if (filter.value === undefined || filter.value === '') return filteredRows

    if (filter.id === 'salary' && Array.isArray(filter.value)) {
      const minimum =
        filter.value[0] === '' ? undefined : Number(filter.value[0])
      const maximum =
        filter.value[1] === '' ? undefined : Number(filter.value[1])
      return filteredRows.filter(
        ({ salary }) =>
          (minimum === undefined || salary >= minimum) &&
          (maximum === undefined || salary <= maximum),
      )
    }

    if (filter.id === 'hiredAt' && Array.isArray(filter.value)) {
      const minimum = asDate(filter.value[0])
      const maximum = asDate(filter.value[1])
      if (maximum) maximum.setHours(23, 59, 59, 999)
      return filteredRows.filter(
        ({ hiredAt }) =>
          (!minimum || hiredAt >= minimum) && (!maximum || hiredAt <= maximum),
      )
    }

    if (filter.id === 'id') {
      return filteredRows.filter(({ id }) => inText(String(id), filter.value))
    }

    if (filter.id === 'name') {
      return filteredRows.filter(({ name }) => inText(name, filter.value))
    }

    if (filter.id === 'department') {
      if (Array.isArray(filter.value)) {
        const selected = filter.value
        return selected.length === 0
          ? filteredRows
          : filteredRows.filter(({ department }) =>
              selected.includes(department),
            )
      }
      return filteredRows.filter(({ department }) =>
        inText(department, filter.value),
      )
    }

    return filteredRows
  }, rows)

const applySorting = (rows: Employee[], sorting: MRT_SortingState) => {
  const sort = sorting.at(0)
  if (!sort) return rows

  return [...rows].sort((left, right) => {
    const leftValue = left[sort.id as keyof Employee]
    const rightValue = right[sort.id as keyof Employee]
    const comparison =
      leftValue instanceof Date && rightValue instanceof Date
        ? leftValue.getTime() - rightValue.getTime()
        : typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue))
    return sort.desc ? -comparison : comparison
  })
}

export async function queryEmployees(
  request: MockRequest,
): Promise<MockResponse> {
  await new Promise((resolve) => setTimeout(resolve, request.latency))
  if (request.fail) throw new Error('The mock server rejected the request')

  const globallyFiltered = request.globalFilter
    ? employees.filter((employee) =>
        Object.values(employee).some((value) =>
          inText(String(value), request.globalFilter),
        ),
      )
    : employees
  const filtered = applyColumnFilters(globallyFiltered, request.columnFilters)
  const sorted = applySorting(filtered, request.sorting)
  const start = request.pagination.pageIndex * request.pagination.pageSize

  return {
    rows: sorted.slice(start, start + request.pagination.pageSize),
    rowCount: sorted.length,
  }
}
