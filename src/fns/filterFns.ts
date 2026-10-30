import { rankItem, rankings } from '@tanstack/match-sorter-utils'
import { filterFns } from '@tanstack/react-table'
import type { RankingInfo } from '@tanstack/match-sorter-utils'
import type { Row, StockFeatures } from '@tanstack/react-table'

import type { MRT_FilterOption, MRT_Localization, MRT_RowData } from '../types'

const fuzzy = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  columnId: string,
  filterValue: number | string,
  addMeta: (item: RankingInfo) => void,
) => {
  const itemRank = rankItem(row.getValue(columnId), filterValue as string, {
    threshold: rankings.MATCHES,
  })
  addMeta(itemRank)
  return itemRank.passed
}

fuzzy.autoRemove = (val: any) => !val

const contains = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValue: number | string,
) =>
  row
    .getValue<number | string>(id)
    ?.toString()
    .toLowerCase()
    .trim()
    .includes(filterValue.toString().toLowerCase().trim())

contains.autoRemove = (val: any) => !val

const getDateFilterTimestamp = (value: number | string) => {
  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (dateOnly) {
      return new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      ).getTime()
    }
    return new Date(value).getTime()
  }
  return new Date(value).getTime()
}

const startsWith = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValue: number | string,
) =>
  row
    .getValue<number | string>(id)
    ?.toString()
    .toLowerCase()
    .trim()
    .startsWith(filterValue.toString().toLowerCase().trim())

startsWith.autoRemove = (val: any) => !val

const endsWith = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValue: number | string,
) =>
  row
    .getValue<number | string>(id)
    ?.toString()
    .toLowerCase()
    .trim()
    .endsWith(filterValue.toString().toLowerCase().trim())

endsWith.autoRemove = (val: any) => !val

const equals = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValue: number | string,
) => {
  const rowValue = row.getValue<Date | number | string>(id)
  if (rowValue instanceof Date) {
    return rowValue.getTime() === getDateFilterTimestamp(filterValue)
  }
  return (
    rowValue?.toString().toLowerCase().trim() ===
    filterValue?.toString().toLowerCase().trim()
  )
}

equals.autoRemove = (val: any) => !val

const notEquals = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValue: number | string,
) =>
  row.getValue<number | string>(id)?.toString().toLowerCase().trim() !==
  filterValue.toString().toLowerCase().trim()

notEquals.autoRemove = (val: any) => !val

const greaterThan = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValue: number | string,
) => {
  const rowValue = row.getValue<Date | number | string>(id)
  if (rowValue instanceof Date) {
    return rowValue.getTime() > getDateFilterTimestamp(filterValue)
  }
  return !isNaN(+filterValue) && !isNaN(+rowValue)
    ? +rowValue > +filterValue
    : rowValue?.toString().toLowerCase().trim() >
        filterValue?.toString().toLowerCase().trim()
}

greaterThan.autoRemove = (val: any) => !val

const greaterThanOrEqualTo = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValue: number | string,
) => equals(row, id, filterValue) || greaterThan(row, id, filterValue)

greaterThanOrEqualTo.autoRemove = (val: any) => !val

const lessThan = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValue: number | string,
) => {
  const rowValue = row.getValue<Date | number | string>(id)
  if (rowValue instanceof Date) {
    return rowValue.getTime() < getDateFilterTimestamp(filterValue)
  }
  return !isNaN(+filterValue) && !isNaN(+rowValue)
    ? +rowValue < +filterValue
    : rowValue?.toString().toLowerCase().trim() <
        filterValue?.toString().toLowerCase().trim()
}

lessThan.autoRemove = (val: any) => !val

const lessThanOrEqualTo = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValue: number | string,
) => equals(row, id, filterValue) || lessThan(row, id, filterValue)

lessThanOrEqualTo.autoRemove = (val: any) => !val

const between = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValues: [number | string, number | string],
) =>
  ((['', undefined] as Array<any>).includes(filterValues[0]) ||
    greaterThan(row, id, filterValues[0])) &&
  ((!isNaN(+filterValues[0]) &&
    !isNaN(+filterValues[1]) &&
    +filterValues[0] > +filterValues[1]) ||
    (['', undefined] as Array<any>).includes(filterValues[1]) ||
    lessThan(row, id, filterValues[1]))

between.autoRemove = (val: any) => !val

const betweenInclusive = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  filterValues: [number | string, number | string],
) => {
  const rowValue = row.getValue<Date | number | string>(id)
  if (rowValue instanceof Date) {
    const minimum = filterValues[0] === '' ? undefined : getDateFilterTimestamp(filterValues[0])
    const maximum = filterValues[1] === '' ? undefined : getDateFilterTimestamp(filterValues[1])
    const endOfMaximumDay = maximum === undefined ? undefined : maximum + 86_400_000 - 1
    return (
      (minimum === undefined || rowValue.getTime() >= minimum) &&
      (endOfMaximumDay === undefined || rowValue.getTime() <= endOfMaximumDay)
    )
  }

  return (
    ((['', undefined] as Array<any>).includes(filterValues[0]) ||
      greaterThanOrEqualTo(row, id, filterValues[0])) &&
    ((!isNaN(+filterValues[0]) &&
      !isNaN(+filterValues[1]) &&
      +filterValues[0] > +filterValues[1]) ||
      (['', undefined] as Array<any>).includes(filterValues[1]) ||
      lessThanOrEqualTo(row, id, filterValues[1]))
  )
}

betweenInclusive.autoRemove = (val: any) => !val

const empty = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  _filterValue: number | string,
) => !row.getValue<number | string>(id)?.toString().trim()

empty.autoRemove = (val: any) => !val

const notEmpty = <TData extends MRT_RowData>(
  row: Row<StockFeatures, TData>,
  id: string,
  _filterValue: number | string,
) => !!row.getValue<number | string>(id)?.toString().trim()

notEmpty.autoRemove = (val: any) => !val

export const MRT_FilterFns = {
  ...filterFns,
  between,
  betweenInclusive,
  contains,
  empty,
  endsWith,
  equals,
  fuzzy,
  greaterThan,
  greaterThanOrEqualTo,
  lessThan,
  lessThanOrEqualTo,
  notEmpty,
  notEquals,
  startsWith,
}

export function localizedFilterOption(
  localization: MRT_Localization,
  option: MRT_FilterOption,
) {
  if (!option) {
    return ''
  }
  const key = `filter${option[0].toUpperCase()}${option.slice(1)}`
  return localization[key as keyof MRT_Localization] ?? ''
}
