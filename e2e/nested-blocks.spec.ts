import { expect, test, type Locator, type Page } from "@playwright/test"
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

async function createPage(page: Page, title: string) {
  await page.goto(`/w/${IDS.product}`)
  await page.getByTestId("new-page").click()
  await expect(page.getByTestId("page-title")).toHaveValue("")
  await page.waitForURL(/\/p\/[^/]+$/)
  const id = new URL(page.url()).pathname.split("/").pop()
  const saved = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("page-title").fill(title)
  await saved
}

function patchSaved(page: Page) {
  return page.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())
}

async function seedLines(page: Page, lines: string[]) {
  const first = page.getByTestId("block-input").first()
  await first.click()
  let saved = patchSaved(page)
  await first.fill(lines[0] ?? "")
  await saved
  for (let index = 1; index < lines.length; index += 1) {
    await page.getByTestId("block-input").nth(index - 1).press("Enter")
    const next = page.getByTestId("block-input").nth(index)
    await expect(next).toBeVisible()
    saved = patchSaved(page)
    await next.fill(lines[index] ?? "")
    await saved
  }
}

async function selectText(locator: Locator, start: number, end: number) {
  await locator.evaluate(
    (field, range) => {
      const input = field as HTMLTextAreaElement
      input.focus()
      input.setSelectionRange(range.start, range.end)
      input.dispatchEvent(new Event("select", { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }))
    },
    { start, end },
  )
}

async function dragBlock(page: Page, from: number, to: number, where: "before" | "after" | "inside") {
  const handle = page.getByTestId("block-drag").nth(from)
  const row = page.getByTestId("block").nth(to)
  const handleBox = await handle.boundingBox()
  const rowBox = await row.boundingBox()
  if (!handleBox || !rowBox) throw new Error("拖拽手柄或目标块没有布局")
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  const shell = row.locator("[data-testid='block-shell']").first()
  const shellBox = (await shell.boundingBox()) ?? rowBox
  const y = where === "before" ? shellBox.y + 3 : where === "after" ? shellBox.y + shellBox.height - 3 : shellBox.y + shellBox.height / 2
  const x = shellBox.x + Math.min(80, Math.max(24, shellBox.width / 2))
  await page.mouse.move(x, y, { steps: 12 })
  await expect(page.getByTestId("drop-indicator")).toHaveAttribute("data-placement", where)
  return y
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test("indents and outdents with Tab and keeps the mark after reload", async ({ page }) => {
  await createPage(page, `缩进${Date.now()}`)
  await seedLines(page, ["父块", "子块"])
  const child = page.getByTestId("block-input").nth(1)
  await selectText(child, 0, 1)
  let saved = patchSaved(page)
  await page.getByTestId("format-bold").click()
  await saved
  await expect(page.locator('[data-inline-marks~="bold"]')).toHaveText("子")

  saved = patchSaved(page)
  await child.press("Tab")
  await saved
  const parentId = await page.getByTestId("block").nth(0).getAttribute("data-block-id")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-parent-id", parentId ?? "")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-depth", "1")
  await expect(page.getByTestId("nested-blocks").getByTestId("block-input")).toHaveValue("子块")

  await page.reload()
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-parent-id", parentId ?? "")
  await expect(page.locator('[data-inline-marks~="bold"]')).toHaveText("子")
  await page.getByTestId("mode-markdown").click()
  await expect(page.getByTestId("markdown-source")).toContainText(":::child")
  await expect(page.getByTestId("markdown-source")).toContainText("**子**块")
  await expect(page.getByTestId("markdown-preview")).toContainText("子块")

  await page.getByTestId("mode-blocks").click()
  saved = patchSaved(page)
  await page.getByTestId("block-input").nth(1).press("Shift+Tab")
  await saved
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-depth", "0")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-parent-id", "")
  await page.reload()
  await expect(page.getByTestId("block-input").nth(1)).toHaveValue("子块")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-depth", "0")
  await expect(page.locator('[data-inline-marks~="bold"]')).toHaveText("子")
})

test("drags a block inside another block and back out to a new level", async ({ page }) => {
  await createPage(page, `拖进块${Date.now()}`)
  await seedLines(page, ["甲", "乙", "丙"])
  const saved = patchSaved(page)
  await dragBlock(page, 1, 0, "inside")
  await expect(page.getByTestId("drop-indicator")).toHaveAttribute("data-blocked", "false")
  await page.mouse.up()
  await saved
  const parentId = await page.getByTestId("block").nth(0).getAttribute("data-block-id")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-parent-id", parentId ?? "")
  await expect(page.getByTestId("nested-blocks").getByTestId("block-input")).toHaveValue("乙")
  await page.reload()
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-parent-id", parentId ?? "")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-depth", "1")

  const lifted = patchSaved(page)
  await dragBlock(page, 1, 2, "before")
  await page.mouse.up()
  await lifted
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-parent-id", "")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-depth", "0")
  await expect.poll(() => page.getByTestId("block-input").evaluateAll((nodes) => nodes.map((node) => (node as HTMLTextAreaElement).value))).toEqual(["甲", "乙", "丙"])
  await page.reload()
  await expect.poll(() => page.getByTestId("block-input").evaluateAll((nodes) => nodes.map((node) => (node as HTMLTextAreaElement).value))).toEqual(["甲", "乙", "丙"])
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-depth", "0")
})

test("does not drop a block into its own descendant", async ({ page }) => {
  await createPage(page, `拖进子孙${Date.now()}`)
  await seedLines(page, ["甲", "乙", "丙"])
  let saved = patchSaved(page)
  await page.getByTestId("block-input").nth(1).press("Tab")
  await saved
  saved = patchSaved(page)
  await page.getByTestId("block-input").nth(2).press("Tab")
  await saved
  saved = patchSaved(page)
  await page.getByTestId("block-input").nth(2).press("Tab")
  await saved
  await expect(page.getByTestId("block").nth(0)).toHaveAttribute("data-depth", "0")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-depth", "1")
  await expect(page.getByTestId("block").nth(2)).toHaveAttribute("data-depth", "2")
  const parentId = await page.getByTestId("block").nth(0).getAttribute("data-block-id")
  const middleId = await page.getByTestId("block").nth(1).getAttribute("data-block-id")

  await dragBlock(page, 0, 2, "inside")
  await expect(page.getByTestId("drop-indicator")).toHaveAttribute("data-blocked", "true")
  await expect(page.getByTestId("block-move-error")).toHaveText("不能把块拖进自己的子块")
  await page.mouse.up()
  await expect(page.getByTestId("drop-indicator")).toHaveCount(0)
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-parent-id", parentId ?? "")
  await expect(page.getByTestId("block").nth(2)).toHaveAttribute("data-parent-id", middleId ?? "")
  await page.reload()
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-depth", "1")
  await expect(page.getByTestId("block").nth(2)).toHaveAttribute("data-depth", "2")
  await expect(page.getByTestId("block").nth(2)).toHaveAttribute("data-parent-id", middleId ?? "")
})
