import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Brief §9.12 / §14: no serious or critical accessibility violations on main screens.
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

test('signed-out visitors are sent to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Sign in to SOLIDARIS' })).toBeVisible()
  await expectAccessible(page)
})

test('sign-up has no role choice and requires consent', async ({ page }) => {
  await page.goto('/sign-up')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await expect(page.getByLabel(/role/i)).toHaveCount(0)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('You need to accept this to use SOLIDARIS.').first()).toBeVisible()
  await expectAccessible(page)
})

test('sign-in shows plain-language validation', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill('not-an-email')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Enter a valid email address, like name@organisation.org.')).toBeVisible()
})

test('unknown pages explain what happened', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expectAccessible(page)
})

test('keyboard users can skip to content', async ({ page }) => {
  await page.goto('/sign-in')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
})
