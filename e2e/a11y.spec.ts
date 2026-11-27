import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { IDS } from "../src/lib/seed-ids"

async function login(page: Page) {
  await page.goto("/login")
  await page.getByTestId("login-email").fill(DEMO_USERS.nash.email)
  await page.getByTestId("login-password").fill(DEMO_USERS.nash.password)
  await page.getByTestId("login-submit").click()
  const sidebar = page.getByTestId("sidebar")
  if (!(await sidebar.isVisible().catch(() => false))) {
    await sidebar.waitFor({ state: "visible", timeout: 20_000 }).catch(async () => {
      await page.getByTestId("login-submit").click()
    })
  }
  await expect(sidebar).toBeVisible({ timeout: 60_000 })
}

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter((item) => item.impact === "critical" || item.impact === "serious")
  expect(blocking.map((item) => ({ id: item.id, impact: item.impact, targets: item.nodes.slice(0, 4).map((node) => node.target) }))).toEqual([])
}

test("has no blocking axe violations on login, editor, history, and share", async ({ page }) => {
  await page.goto("/login")
  await expectNoBlockingViolations(page)
  await login(page)
  await page.goto(`/w/${IDS.product}/p/${IDS.welcome}`)
  await expect(page.getByTestId("page-title")).toHaveValue("欢迎来到 Folio")
  await expectNoBlockingViolations(page)
  await page.getByTestId("page-history").click()
  await expect(page.getByTestId("history-dialog")).toBeVisible()
  await expectNoBlockingViolations(page)
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("history-dialog")).toHaveCount(0)
  await page.goto(`/share/${IDS.welcome}`)
  await expect(page.getByRole("heading", { name: "欢迎来到 Folio" })).toBeVisible()
  await expectNoBlockingViolations(page)
})

test.describe("dark theme", () => {
  test.use({ colorScheme: "dark" })

  test("has no blocking axe violations on login, editor, history, and share", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
    await expectNoBlockingViolations(page)
    await login(page)
    await page.goto(`/w/${IDS.product}/p/${IDS.welcome}`)
    await expect(page.getByTestId("page-title")).toHaveValue("欢迎来到 Folio")
    await expectNoBlockingViolations(page)
    await page.getByTestId("page-history").click()
    await expect(page.getByTestId("history-dialog")).toBeVisible()
    await expectNoBlockingViolations(page)
    await page.keyboard.press("Escape")
    await page.goto(`/share/${IDS.welcome}`)
    await expect(page.getByRole("heading", { name: "欢迎来到 Folio" })).toBeVisible()
    await expectNoBlockingViolations(page)
  })
})

test("moves through the sidebar with the keyboard and traps a dialog", async ({ page }) => {
  await login(page)
  await page.goto(`/w/${IDS.product}`)
  const links = page.getByTestId("page-link")
  await expect(links.first()).toBeVisible()
  await links.first().focus()
  const firstId = await links.first().getAttribute("data-page-id")
  await page.keyboard.press("ArrowDown")
  const activeId = await page.evaluate(() => document.activeElement?.getAttribute("data-page-id"))
  expect(activeId).toBeTruthy()
  expect(activeId).not.toBe(firstId)

  await page.keyboard.press("Control+k")
  const dialog = page.getByRole("dialog", { name: "搜索页面" })
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId("search-input")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
})
