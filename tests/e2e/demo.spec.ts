import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const status = (page: Page) => page.getByTestId('table-status')
const browserErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(() => {
    window.addEventListener('error', (event) => console.error(event.message))
  })
  await page.goto('/')
  await expect(page.getByTestId('table-status')).toContainText(
    'Showing 20 rows',
  )
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([])
})

test('shows native loading and controlled error states with retry', async ({
  page,
}) => {
  await page.getByRole('switch', { name: 'Force loading state' }).check()
  await expect(status(page)).toHaveText('Loading')
  await expect(page.locator('.mantine-Skeleton-root').first()).toBeVisible()
  await page.getByRole('switch', { name: 'Force loading state' }).uncheck()

  await page.getByRole('switch', { name: 'Force error response' }).check()
  await expect(status(page)).toHaveText('Error')
  await expect(
    page.getByText('The mock server rejected the request'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(status(page)).toContainText('Showing 20 rows')
  await expect(
    page.getByText('The mock server rejected the request'),
  ).toBeHidden()
})

test('filters numeric and date ranges on the client', async ({ page }) => {
  const salaryHeader = page.locator('th').filter({ hasText: 'Salary' })
  await salaryHeader.getByRole('textbox', { name: 'Min' }).fill('150000')

  const salaryCells = page.locator('tbody tr td:nth-child(4)')
  await expect(salaryCells.first()).toBeVisible()
  await expect
    .poll(async () =>
      Number((await salaryCells.first().innerText()).replace(/[^0-9]/g, '')),
    )
    .toBeGreaterThanOrEqual(150000)
  for (const salary of await salaryCells.allTextContents()) {
    expect(Number(salary.replace(/[^0-9]/g, ''))).toBeGreaterThanOrEqual(150000)
  }

  const hiredHeader = page.locator('th').filter({ hasText: 'Hired' })
  await hiredHeader.getByRole('textbox', { name: 'Min' }).fill('01/01/2024')
  await expect
    .poll(async () =>
      hiredHeader.getByRole('textbox', { name: 'Min' }).inputValue(),
    )
    .toContain('2024')

  const dateCells = page.locator('tbody tr td:nth-child(5)')
  await expect(dateCells.first()).toBeVisible()
  await expect
    .poll(async () =>
      Number((await dateCells.first().innerText()).split('/').at(-1)),
    )
    .toBeGreaterThanOrEqual(2024)
  for (const date of (await dateCells.allTextContents()).filter((value) =>
    /^\d{2}\/\d{2}\/\d{4}$/.test(value),
  )) {
    const [day, month, year] = date.split('/').map(Number)
    expect(new Date(year, month - 1, day).getTime()).toBeGreaterThanOrEqual(
      new Date(2024, 0, 1).getTime(),
    )
  }
})

test('filters a bounded date range on the client with inclusive dates', async ({
  page,
}) => {
  const hiredHeader = page.locator('th').filter({ hasText: 'Hired' })
  const minimum = hiredHeader.getByRole('textbox', { name: 'Min' })
  const maximum = hiredHeader.getByRole('textbox', { name: 'Max' })

  await minimum.fill('01/01/2024')
  await expect(page.getByText('1-20 of 60')).toBeVisible()

  await maximum.fill('31/12/2024')
  await expect(page.getByText('1-20 of 30')).toBeVisible()

  const visibleDates = await page
    .locator('tbody tr td:nth-child(5)')
    .allTextContents()
  expect(
    visibleDates.filter((date) => /^\d{2}\/\d{2}\/\d{4}$/.test(date)),
  ).not.toHaveLength(0)
  for (const date of visibleDates.filter((value) =>
    /^\d{2}\/\d{2}\/\d{4}$/.test(value),
  )) {
    expect(date.endsWith('/2024')).toBe(true)
  }
})

test('persists filter, pagination, and sorting state in the URL', async ({
  page,
}) => {
  await page
    .getByRole('switch', {
      name: 'Store filter, pagination and sort state in the URL',
    })
    .check()
  await page
    .locator('th')
    .filter({ hasText: 'Name' })
    .getByRole('textbox')
    .fill('Ava')
  await page.getByRole('button', { name: /Sort by Salary/ }).click()
  await page.getByRole('button', { name: 'Go to next page' }).click()

  await expect
    .poll(() => new URL(page.url()).searchParams.get('page'))
    .toBe('2')
  expect(new URL(page.url()).searchParams.get('filters')).toContain('Ava')
  expect(new URL(page.url()).searchParams.get('sorting')).toContain('salary')

  await page.reload()
  await expect(
    page.getByRole('switch', {
      name: 'Store filter, pagination and sort state in the URL',
    }),
  ).toBeChecked()
  await expect(
    page.locator('th').filter({ hasText: 'Name' }).getByRole('textbox'),
  ).toHaveValue('Ava')
  await expect
    .poll(() => new URL(page.url()).searchParams.get('page'))
    .toBe('2')
  await expect(page.getByText('21-30 of 30', { exact: true })).toBeVisible()
})

test('runs filtering, sorting, and pagination through the delayed mock server', async ({
  page,
}) => {
  await page.getByText('1.2 s', { exact: true }).click()
  await page.getByText('Mock server', { exact: true }).click()

  const startedAt = Date.now()
  await page
    .locator('th')
    .filter({ hasText: 'Name' })
    .getByRole('textbox')
    .fill('Ava')
  await expect(status(page)).toContainText('of 30')
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900)

  await page.getByRole('button', { name: /Sort by Salary/ }).click()
  await expect(
    page.getByRole('button', { name: /Sorted by Salary/ }),
  ).toBeVisible()

  const firstPageIds = await page
    .locator('tbody tr td:first-child')
    .allTextContents()
  await page.getByRole('button', { name: 'Go to next page' }).click()
  await expect
    .poll(() => page.locator('tbody tr td:first-child').allTextContents())
    .not.toEqual(firstPageIds)
})

test('loads additional mock-server pages while infinitely scrolling', async ({
  page,
}) => {
  await page.getByText('Infinite scroll', { exact: true }).click()
  await expect(status(page)).toHaveText('Showing 40 rows of 240')
  await expect(page.getByRole('radio', { name: 'Mock server' })).toBeChecked()

  const tableContainer = page.locator('.mrt-table-container')
  await tableContainer.evaluate((element) =>
    element.scrollTo(0, element.scrollHeight),
  )
  await expect(status(page)).toHaveText('Showing 80 rows of 240')

  await page.getByText('1.2 s', { exact: true }).click()
  await expect(page.getByRole('progressbar').first()).toBeVisible()
  await expect(page.getByRole('progressbar').first()).toBeHidden()
  await expect(status(page)).toHaveText('Showing 80 rows of 240')

  await tableContainer.evaluate((element) =>
    element.scrollTo(0, element.scrollHeight),
  )
  await expect(status(page)).toHaveText('Showing 120 rows of 240')

  await page.getByRole('switch', { name: 'Force error response' }).check()
  await expect(status(page)).toHaveText('Error')
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(status(page)).toHaveText('Showing 40 rows of 240')
})

for (const mode of ['Client', 'Mock server']) {
  test(`multi-select matches scalar values and clears in ${mode} mode`, async ({
    page,
  }) => {
    await page.getByText(mode, { exact: true }).click()
    const department = page.locator('th').filter({ hasText: 'Department' })
    await department.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Engineering', exact: true }).click()
    await page.getByRole('option', { name: 'Finance', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('1-20 of 120', { exact: true })).toBeVisible()
    const values = await page
      .locator('tbody tr td:nth-child(3)')
      .allTextContents()
    expect(new Set(values)).toEqual(new Set(['Engineering', 'Finance']))
    await department.getByRole('button', { name: 'Clear departments' }).click()
    await expect(page.getByText('1-20 of 240', { exact: true })).toBeVisible()
  })
}

test('real range inputs commit both bounds and clear without losing edits', async ({
  page,
}) => {
  await page
    .getByRole('switch', {
      name: 'Store filter, pagination and sort state in the URL',
    })
    .check()
  const salary = page.locator('th').filter({ hasText: 'Salary' })
  const minimum = salary.getByRole('textbox', { name: 'Min' })
  const maximum = salary.getByRole('textbox', { name: 'Max' })
  await minimum.fill('150000')
  await maximum.fill('160000')
  await expect
    .poll(() =>
      JSON.parse(new URL(page.url()).searchParams.get('filters') ?? '[]'),
    )
    .toEqual([{ id: 'salary', value: ['150000', '160000'] }])
  const cells = page.locator('tbody tr td:nth-child(4)')
  await expect(cells.first()).toBeVisible()
  for (const value of await cells.allTextContents()) {
    const salary = Number(value.replace(/[^0-9]/g, ''))
    expect(salary).toBeGreaterThanOrEqual(150000)
    expect(salary).toBeLessThanOrEqual(160000)
  }
  await minimum.fill('')
  await maximum.fill('')
  await expect(page.getByText('1-20 of 240', { exact: true })).toBeVisible()
  await expect
    .poll(() => new URL(page.url()).searchParams.get('filters'))
    .toBeNull()
})
