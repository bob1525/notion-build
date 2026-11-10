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

async function createPage(page: Page, title: string, body: string) {
  await page.goto(`/w/${IDS.product}`)
  const created = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/workspaces\/[^/]+\/pages$/.test(new URL(response.url()).pathname) && response.ok())
  await page.getByTestId("new-page").click()
  const id = ((await (await created).json()) as { data: { id: string } }).data.id
  await page.waitForURL(new RegExp(`/p/${id}$`))
  const titleSaved = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("page-title").fill(title)
  await titleSaved
  const bodySaved = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("block-input").first().fill(body)
  await bodySaved
  return id
}

function patchSaved(page: Page) {
  return page.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())
}

async function selectText(input: Locator, start: number, end: number) {
  await input.evaluate((element, range) => {
    const field = element as HTMLTextAreaElement
    field.focus()
    field.setSelectionRange(range.start, range.end)
    field.dispatchEvent(new Event("select", { bubbles: true }))
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }))
  }, { start, end })
}

test("adds, edits, opens, and removes a link", async ({ page }) => {
  await login(page)
  await createPage(page, `行内链接${Date.now()}`, "前后链接文字")
  const input = page.getByTestId("block-input").first()
  await selectText(input, 2, 4)
  await expect(page.getByTestId("format-toolbar")).toBeVisible()
  await page.getByTestId("format-link").click()
  await expect(page.getByTestId("link-popover")).toBeVisible()
  await page.getByTestId("link-url").fill("http://127.0.0.1:3000/login")
  let saved = patchSaved(page)
  await page.getByTestId("link-apply").click()
  await saved
  await expect(page.getByTestId("inline-link")).toHaveAttribute("href", "http://127.0.0.1:3000/login")
  await expect(page.getByTestId("inline-link")).toHaveText("链接")
  await expect(input).toHaveValue("前后链接文字")

  await page.reload()
  await expect(page.getByTestId("inline-link")).toHaveAttribute("href", "http://127.0.0.1:3000/login")

  const again = page.getByTestId("block-input").first()
  await selectText(again, 2, 4)
  await again.press("Control+k")
  await expect(page.getByTestId("search-input")).toHaveCount(0)
  await expect(page.getByTestId("link-url")).toHaveValue("http://127.0.0.1:3000/login")
  await page.getByTestId("link-url").fill("http://127.0.0.1:3000/share/page_welcome")
  saved = patchSaved(page)
  await page.getByTestId("link-apply").click()
  await saved
  await expect(page.getByTestId("inline-link")).toHaveAttribute("href", "http://127.0.0.1:3000/share/page_welcome")

  await selectText(page.getByTestId("block-input").first(), 2, 4)
  await page.getByTestId("format-link").click()
  const popupPromise = page.waitForEvent("popup")
  await page.getByTestId("link-open").click()
  const popup = await popupPromise
  await expect(popup).toHaveURL("http://127.0.0.1:3000/share/page_welcome")
  await expect(popup.getByRole("heading", { name: "欢迎来到 Folio" })).toBeVisible()
  await popup.close()

  saved = patchSaved(page)
  await page.getByTestId("link-remove").click()
  await saved
  await expect(page.getByTestId("inline-link")).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId("block-input").first()).toHaveValue("前后链接文字")
  await expect(page.getByTestId("inline-link")).toHaveCount(0)
})

test("rejects javascript urls and keeps a safe link clickable on the share page", async ({ page }) => {
  await login(page)
  const id = await createPage(page, `链接安全${Date.now()}`, "点我")
  const input = page.getByTestId("block-input").first()
  await selectText(input, 0, 2)
  await page.getByTestId("format-link").click()
  await page.getByTestId("link-url").fill("javascript:alert(1)")
  await page.getByTestId("link-apply").click()
  await expect(page.getByTestId("link-error")).toHaveText("只接受 http 或 https 链接")
  await expect(page.getByTestId("inline-link")).toHaveCount(0)
  await expect(input).toHaveValue("点我")

  await page.getByTestId("link-url").fill("http://127.0.0.1:3000/share/page_welcome")
  const saved = patchSaved(page)
  await page.getByTestId("link-apply").click()
  await saved
  await page.getByTestId("mode-markdown").click()
  await expect(page.getByTestId("markdown-source")).toHaveValue("[点我](http://127.0.0.1:3000/share/page_welcome)\n")
  await expect(page.getByTestId("markdown-preview").getByTestId("inline-link")).toHaveAttribute("href", "http://127.0.0.1:3000/share/page_welcome")

  await page.getByTestId("mode-blocks").click()
  const published = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("visibility-public").click()
  await published
  await page.goto(`/share/${id}`)
  const popupPromise = page.waitForEvent("popup")
  await page.getByTestId("inline-link").click()
  const popup = await popupPromise
  await expect(popup).toHaveURL("http://127.0.0.1:3000/share/page_welcome")
  await expect(popup.getByRole("heading", { name: "欢迎来到 Folio" })).toBeVisible()
  await popup.close()
})
