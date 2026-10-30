import { getAllLeafColumnDefs, getColumnId } from './column.utils'
import type { MRT_ColumnDef, MRT_RowData } from '../types'

const skeletonRowMarker = Symbol('mrt-skeleton-row')

type MRT_SkeletonRow = Record<string, null> & {
  [skeletonRowMarker]: true
}

export const isSkeletonRow = (original: MRT_RowData | undefined): boolean =>
  typeof original === 'object' &&
  original !== null &&
  skeletonRowMarker in original

export const createSkeletonRows = <TData extends MRT_RowData>(
  columns: Array<MRT_ColumnDef<TData>>,
  pageSize: number,
): Array<MRT_SkeletonRow> => {
  const values: Record<string, null> = Object.fromEntries(
    getAllLeafColumnDefs(columns).map((column) => [getColumnId(column), null]),
  )

  return Array.from(
    { length: Math.min(pageSize, 20) },
    (): MRT_SkeletonRow => ({ ...values, [skeletonRowMarker]: true }),
  )
}

export const withoutSkeletonAccessors = <TData extends MRT_RowData>(
  columns: Array<MRT_ColumnDef<TData>>,
  defaultColumn?: Partial<MRT_ColumnDef<TData>>,
): Array<MRT_ColumnDef<TData>> =>
  columns.map((column) => {
    // TanStack merges defaults after MRT prepares columns. Include inherited
    // callbacks, while preserving explicit overrides such as undefined.
    const resolvedColumn = { ...defaultColumn, ...column }
    return {
      ...column,
      ...((resolvedColumn.accessorFn ||
        resolvedColumn.accessorKey !== undefined) && {
        accessorFn: () => undefined,
      }),
      ...(resolvedColumn.getUniqueValues && { getUniqueValues: () => [] }),
      ...(resolvedColumn.getGroupingValue && {
        getGroupingValue: () => undefined,
      }),
      ...(column.columns && {
        columns: withoutSkeletonAccessors(column.columns, defaultColumn),
      }),
    }
  })

export const skipSkeletonFacets =
  <TTable extends { options: { data: ReadonlyArray<MRT_RowData> } }, TValue>(
    factory: (table: TTable, columnId: string) => () => TValue,
    makeEmptyValue: () => NoInfer<TValue>,
  ): ((table: TTable, columnId: string) => () => TValue) =>
  (table, columnId) => {
    let getValue: (() => TValue) | undefined
    // Stable per-column results avoid sharing mutable Maps between consumers.
    const emptyValue = makeEmptyValue()
    return () => {
      if (isSkeletonRow(table.options.data[0])) return emptyValue
      // Even a custom factory must not inspect the synthetic records.
      getValue ??= factory(table, columnId)
      return getValue()
    }
  }
