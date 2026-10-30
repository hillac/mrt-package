import clsx from 'clsx'

import { Box } from '@mantine/core'
import { useLayoutEffect, useRef, useState } from 'react'
import classes from './MRT_FilterRangeFields.module.css'

import { MRT_FilterTextInput } from './MRT_FilterTextInput'
import type { BoxProps } from '@mantine/core'

import type { MRT_Header, MRT_RowData, MRT_TableInstance } from '../../types'

interface Props<TData extends MRT_RowData> extends BoxProps {
  header: MRT_Header<TData>
  table: MRT_TableInstance<TData>
}

export const MRT_FilterRangeFields = <TData extends MRT_RowData>({
  header,
  table,
  ...rest
}: Props<TData>) => {
  const {
    options: { manualFiltering },
  } = table
  const { column } = header
  const columnFilterValue = column.getFilterValue()
  const minimum = Array.isArray(columnFilterValue) ? columnFilterValue[0] ?? '' : ''
  const maximum = Array.isArray(columnFilterValue) ? columnFilterValue[1] ?? '' : ''
  const [filterValues, setFilterValues] = useState<[unknown, unknown]>([
    minimum,
    maximum,
  ])
  const filterValuesRef = useRef(filterValues)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A new array with identical bounds is not an external change. Real changes
  // replace the draft and cancel pending edits before they can overwrite a reset.
  useLayoutEffect(() => {
    const next: [unknown, unknown] = [minimum, maximum]
    filterValuesRef.current = next
    setFilterValues(next)
    return () => clearTimeout(timeoutRef.current)
  }, [minimum, maximum])

  const setRangeFilterValue = (index: 0 | 1, value: unknown) => {
    const next: [unknown, unknown] = [...filterValuesRef.current]
    next[index] = value ?? ''
    filterValuesRef.current = next
    setFilterValues(next)
    clearTimeout(timeoutRef.current)
    // Only user edits schedule writes: mounting and receiving external state
    // must not echo values back, including during Strict Mode effect replay.
    timeoutRef.current = setTimeout(() => {
      const hasFilterValue = next.some((bound) => bound !== '')
      column.setFilterValue(hasFilterValue ? [...next] : undefined)
    }, manualFiltering ? 400 : 200)
  }

  return (
    <Box
      {...rest}
      className={clsx('mrt-filter-range-fields', classes.root, rest.className)}
    >
      <MRT_FilterTextInput
        header={header}
        onRangeFilterValueChange={(value) => setRangeFilterValue(0, value)}
        rangeFilterIndex={0}
        rangeFilterValue={filterValues[0]}
        table={table}
      />
      <MRT_FilterTextInput
        header={header}
        onRangeFilterValueChange={(value) => setRangeFilterValue(1, value)}
        rangeFilterIndex={1}
        rangeFilterValue={filterValues[1]}
        table={table}
      />
    </Box>
  )
}
