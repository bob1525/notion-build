import { expect, test } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { IDS } from "../src/lib/seed-ids"

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
