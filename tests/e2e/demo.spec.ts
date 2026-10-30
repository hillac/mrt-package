import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const status = (page: Page) => page.getByTestId('table-status')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('table-status')).toContainText('Showing 20 rows')
})

test('shows native loading and controlled error states with retry', async ({ page }) => {
  await page.getByRole('switch', { name: 'Force loading state' }).check()
  await expect(status(page)).toHaveText('Loading')
  await expect(page.locator('.mantine-Skeleton-root').first()).toBeVisible()
  await page.getByRole('switch', { name: 'Force loading state' }).uncheck()

  await page.getByRole('switch', { name: 'Force error response' }).check()
  await expect(status(page)).toHaveText('Error')
  await expect(page.getByText('The mock server rejected the request')).toBeVisible()

  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(status(page)).toContainText('Showing 20 rows')
  await expect(page.getByText('The mock server rejected the request')).toBeHidden()
})

test('filters numeric and date ranges on the client', async ({ page }) => {
  const salaryHeader = page.locator('th').filter({ hasText: 'Salary' })
  await salaryHeader.getByRole('textbox', { name: 'Min' }).fill('150000')

  const salaryCells = page.locator('tbody tr td:nth-child(4)')
  await expect(salaryCells.first()).toBeVisible()
  await expect
    .poll(async () => Number((await salaryCells.first().innerText()).replace(/[^0-9]/g, '')))
    .toBeGreaterThanOrEqual(150000)
  for (const salary of await salaryCells.allTextContents()) {
    expect(Number(salary.replace(/[^0-9]/g, ''))).toBeGreaterThanOrEqual(150000)
  }

  const hiredHeader = page.locator('th').filter({ hasText: 'Hired' })
  await hiredHeader.getByRole('textbox', { name: 'Min' }).fill('01/01/2024')
  await expect
    .poll(async () => hiredHeader.getByRole('textbox', { name: 'Min' }).inputValue())
    .toContain('2024')

  const dateCells = page.locator('tbody tr td:nth-child(5)')
  await expect(dateCells.first()).toBeVisible()
  await expect
    .poll(async () => Number((await dateCells.first().innerText()).split('/').at(-1)))
    .toBeGreaterThanOrEqual(2024)
  for (const date of (await dateCells.allTextContents()).filter((value) => /^\d{2}\/\d{2}\/\d{4}$/.test(value))) {
    const [day, month, year] = date.split('/').map(Number)
    expect(new Date(year, month - 1, day).getTime()).toBeGreaterThanOrEqual(
      new Date(2024, 0, 1).getTime(),
    )
  }
})

test('filters a bounded date range on the client with inclusive dates', async ({ page }) => {
  const hiredHeader = page.locator('th').filter({ hasText: 'Hired' })
  const minimum = hiredHeader.getByRole('textbox', { name: 'Min' })
  const maximum = hiredHeader.getByRole('textbox', { name: 'Max' })

  await minimum.fill('01/01/2024')
  await expect(page.getByText('1-20 of 60')).toBeVisible()

  await maximum.fill('31/12/2024')
  await expect(page.getByText('1-20 of 30')).toBeVisible()

  const visibleDates = await page.locator('tbody tr td:nth-child(5)').allTextContents()
  expect(visibleDates.filter((date) => /^\d{2}\/\d{2}\/\d{4}$/.test(date))).not.toHaveLength(0)
  for (const date of visibleDates.filter((value) => /^\d{2}\/\d{2}\/\d{4}$/.test(value))) {
    expect(date.endsWith('/2024')).toBe(true)
  }
})

test('persists filter, pagination, and sorting state in the URL', async ({ page }) => {
  await page
    .getByRole('switch', { name: 'Store filter, pagination and sort state in the URL' })
    .check()
  await page.locator('th').filter({ hasText: 'Name' }).getByRole('textbox').fill('Ava')
  await page.getByRole('button', { name: /Sort by Salary/ }).click()
  await page.getByRole('button', { name: 'Go to next page' }).click()

  await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('2')
  expect(new URL(page.url()).searchParams.get('filters')).toContain('Ava')
  expect(new URL(page.url()).searchParams.get('sorting')).toContain('salary')

  await page.reload()
  await expect(
    page.getByRole('switch', { name: 'Store filter, pagination and sort state in the URL' }),
  ).toBeChecked()
  await expect(page.locator('th').filter({ hasText: 'Name' }).getByRole('textbox')).toHaveValue(
    'Ava',
  )
  await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('2')
})

test('runs filtering, sorting, and pagination through the delayed mock server', async ({ page }) => {
  await page.getByText('1.2 s', { exact: true }).click()
  await page.getByText('Mock server', { exact: true }).click()

  const startedAt = Date.now()
  await page.locator('th').filter({ hasText: 'Name' }).getByRole('textbox').fill('Ava')
  await expect(status(page)).toContainText('of 30')
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900)

  await page.getByRole('button', { name: /Sort by Salary/ }).click()
  await expect(page.getByRole('button', { name: /Sorted by Salary/ })).toBeVisible()

  const firstPageIds = await page.locator('tbody tr td:first-child').allTextContents()
  await page.getByRole('button', { name: 'Go to next page' }).click()
  await expect.poll(() => page.locator('tbody tr td:first-child').allTextContents()).not.toEqual(
    firstPageIds,
  )
})

test('loads additional mock-server pages while infinitely scrolling', async ({ page }) => {
  await page.getByText('Infinite scroll', { exact: true }).click()
  await expect(status(page)).toHaveText('Showing 40 rows of 240')
  await expect(page.getByRole('radio', { name: 'Mock server' })).toBeChecked()

  const tableContainer = page.locator('.mrt-table-container')
  await tableContainer.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await expect(status(page)).toHaveText('Showing 80 rows of 240')
})
