import { expect, test, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { IDS } from "../src/lib/seed-ids"

async function login(page: Page, email: string) {
  await page.goto("/login")
  await page.getByTestId("login-email").fill(email)
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

test.use({ colorScheme: "dark" })

test("follows the system theme and keeps a manual choice", async ({ page }) => {
  await page.goto("/login")
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  const toggle = page.getByTestId("theme-toggle")
  await expect(toggle).toHaveAttribute("data-preference", "system")
  await toggle.click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await expect(toggle).toHaveAttribute("data-preference", "light")
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await toggle.click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await expect(toggle).toHaveAttribute("data-preference", "dark")
  await toggle.click()
  await expect(toggle).toHaveAttribute("data-preference", "system")
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
})

test("uses the same appearance control on a shared page", async ({ page }) => {
  await page.goto(`/share/${IDS.welcome}`)
  await expect(page.getByRole("heading", { name: "欢迎来到 Folio" })).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await page.getByTestId("theme-toggle").click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
})

test("keeps a signed-in theme across browsers", async ({ browser }) => {
  const first = await browser.newContext({ colorScheme: "dark" })
  const second = await browser.newContext({ colorScheme: "dark" })
  const page = await first.newPage()
  const other = await second.newPage()
  try {
    await login(page, DEMO_USERS.nash.email)
    const toggle = page.getByTestId("theme-toggle")
    for (let step = 0; step < 3; step += 1) {
      if ((await toggle.getAttribute("data-preference")) === "light") break
      const saved = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes("/api/me/theme") && response.ok())
      await toggle.click()
      await saved
    }
    await expect(toggle).toHaveAttribute("data-preference", "light")
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light")

    await login(other, DEMO_USERS.nash.email)
    await expect(other.locator("html")).toHaveAttribute("data-theme", "light")
    await expect(other.getByTestId("theme-toggle")).toHaveAttribute("data-preference", "light")
    expect(await other.evaluate(() => localStorage.getItem("folio-theme"))).toBe("light")

    const response = await other.reload()
    await expect(other.locator("html")).toHaveAttribute("data-theme", "light")
    await expect(other.getByTestId("sidebar")).toBeVisible()
    const html = await response?.text()
    expect(html).toContain('var account = \\"light\\"')
    expect(html).not.toContain('var account = \\"dark\\"')
    expect(html).not.toContain("var account = null")
  } finally {
    await first.close()
    await second.close()
  }
})

test("lets the account theme replace a different choice on this browser", async ({ browser }) => {
  const owner = await browser.newContext({ colorScheme: "light" })
  const other = await browser.newContext({ colorScheme: "dark" })
  const page = await owner.newPage()
  const guest = await other.newPage()
  try {
    await login(page, DEMO_USERS.nash.email)
    const saved = await page.evaluate(async () => {
      const response = await fetch("/api/me/theme", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: "dark" }),
      })
      return response.status
    })
    expect(saved).toBe(200)
    await page.reload()
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-preference", "dark")

    await guest.goto("/login")
    await guest.evaluate(() => localStorage.setItem("folio-theme", "light"))
    await guest.reload()
    await expect(guest.locator("html")).toHaveAttribute("data-theme", "light")
    await guest.getByTestId("login-email").fill(DEMO_USERS.nash.email)
    await guest.getByTestId("login-password").fill(DEMO_USERS.nash.password)
    await guest.getByTestId("login-submit").click()
    await expect(guest.getByTestId("sidebar")).toBeVisible({ timeout: 60_000 })
    await expect(guest.locator("html")).toHaveAttribute("data-theme", "dark")
    await expect(guest.getByTestId("theme-toggle")).toHaveAttribute("data-preference", "dark")
    expect(await guest.evaluate(() => localStorage.getItem("folio-theme"))).toBe("dark")
  } finally {
    await owner.close()
    await other.close()
  }
})

test("saves this browser's theme onto a new account", async ({ browser }) => {
  const first = await browser.newContext({ colorScheme: "dark" })
  const second = await browser.newContext({ colorScheme: "dark" })
  const page = await first.newPage()
  const other = await second.newPage()
  const email = `theme-${Date.now()}@folio.dev`
  try {
    await page.goto("/register")
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
    await page.getByTestId("theme-toggle").click()
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-preference", "light")
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
    await page.getByTestId("register-name").fill("主题")
    await page.getByTestId("register-email").fill(email)
    await page.getByTestId("register-password").fill(DEMO_USERS.nash.password)
    await page.getByTestId("register-submit").click()
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-preference", "light")

    await login(other, email)
    await expect(other.locator("html")).toHaveAttribute("data-theme", "light")
    await expect(other.getByTestId("theme-toggle")).toHaveAttribute("data-preference", "light")
  } finally {
    await first.close()
    await second.close()
  }
})
