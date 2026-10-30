import type {
  MRT_ColumnFiltersState,
  MRT_PaginationState,
  MRT_SortingState,
} from '../src'

export type DemoUrlState = {
  columnFilters: MRT_ColumnFiltersState
  dataMode: 'client' | 'server'
  globalFilter: string
  navigation: 'infinite' | 'pagination'
  pagination: MRT_PaginationState
  sorting: MRT_SortingState
  urlStateEnabled: boolean
}

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function readUrlState(): DemoUrlState {
  const params = new URLSearchParams(window.location.search)
  const pageIndex = Number(params.get('page') ?? 1) - 1
  const pageSize = Number(params.get('pageSize') ?? 20)
  return {
    columnFilters: parseJson(params.get('filters'), []),
    dataMode: params.get('mode') === 'server' ? 'server' : 'client',
    globalFilter: params.get('search') ?? '',
    navigation: params.get('navigation') === 'infinite' ? 'infinite' : 'pagination',
    pagination: {
      pageIndex: Number.isFinite(pageIndex) && pageIndex >= 0 ? pageIndex : 0,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    },
    sorting: parseJson(params.get('sorting'), []),
    urlStateEnabled: params.get('urlState') === '1',
  }
}

export function writeUrlState(state: DemoUrlState) {
  if (!state.urlStateEnabled) return
  const params = new URLSearchParams()
  params.set('urlState', '1')
  params.set('mode', state.dataMode)
  params.set('navigation', state.navigation)
  params.set('page', String(state.pagination.pageIndex + 1))
  params.set('pageSize', String(state.pagination.pageSize))
  if (state.globalFilter) params.set('search', state.globalFilter)
  if (state.columnFilters.length) params.set('filters', JSON.stringify(state.columnFilters))
  if (state.sorting.length) params.set('sorting', JSON.stringify(state.sorting))
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}
