import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockSignedIn } from './mockBackend'

// Brief §14: axe finds no serious or critical violations on the main screens.
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`)).toEqual([])
}

test.describe('signed-in screens (mocked backend)', () => {
  let projectId = ''
  test.beforeEach(async ({ page }) => {
    projectId = (await mockSignedIn(page)).projectId
  })

  test('home shows what to do next and the project list', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'What to do next' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Kaduna Equity Fund' })).toBeVisible()
    await expectAccessible(page)
  })

  test('project overview, team, scoping and context', async ({ page }) => {
    for (const [path, heading] of [
      ['', 'Kaduna Equity Fund'],
      ['/team', 'Team'],
      ['/scoping', 'Scoping and triage'],
      ['/context', 'Context profile'],
    ]) {
      await page.goto(`/projects/${projectId}${path}`)
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
      await expectAccessible(page)
    }
  })

  test('gate review explains the automatic checks and why a decision is blocked', async ({ page }) => {
    await page.goto(`/projects/${projectId}/gates/G6`)
    await expect(page.getByRole('heading', { name: 'Gate G6 review' })).toBeVisible()
    await expect(page.getByText('0 member-checks recorded')).toBeVisible()
    await expect(page.getByText('Answer the remaining 1 criterion first.')).toBeVisible()
    await expectAccessible(page)
  })

  test('profile shows domain ratings only, with Not rated for unrated domains', async ({ page }) => {
    await page.goto(`/projects/${projectId}/profile`)
    await expect(page.getByRole('heading', { name: 'Solidarity profile' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Domain-by-domain profile' })).toContainText('Not rated')
    await expect(page.locator('body')).not.toContainText(/average|overall score|index/i)
    await expectAccessible(page)
  })

  test('evidence and report pages', async ({ page }) => {
    await page.goto(`/projects/${projectId}/evidence`)
    await expect(page.getByRole('heading', { name: 'Evidence repository' })).toBeVisible()
    await expectAccessible(page)
    await page.goto(`/projects/${projectId}/report`)
    await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible()
    await expectAccessible(page)
  })

  test('admin M&E dashboard', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible()
    await expect(page.getByText('8 of 9 (89%)')).toBeVisible()
    await expectAccessible(page)
  })
})
