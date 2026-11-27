import { expect, test, type Locator, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { IDS } from "../src/lib/seed-ids"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

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
  const created = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/workspaces\/[^/]+\/pages$/.test(new URL(response.url()).pathname) && response.ok())
  await page.getByTestId("new-page").click()
  const id = ((await (await created).json()) as { data: { id: string } }).data.id
  await page.waitForURL(new RegExp(`/p/${id}$`))
  const saved = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("page-title").fill(title)
  await saved
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

test("copies a page that contains an uploaded image", async ({ page }) => {
  await login(page)
  const title = `图片页${Date.now()}`
  const sourceId = await createPage(page, title)
  const captionSaved = patchSaved(page)
  await page.getByTestId("block-input").first().fill("配图说明")
  await captionSaved
  const split = patchSaved(page)
  await page.getByTestId("block-input").first().press("Enter")
  await split
  await page.getByTestId("block-input").nth(1).fill("/图片")
  await page.getByTestId("slash-image").click()
  const uploaded = page.waitForResponse((response) => response.url().includes("/api/uploads") && response.request().method() === "POST" && response.ok())
  const imageSaved = patchSaved(page)
  await page.getByTestId("image-file").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG })
  const src = ((await (await uploaded).json()) as { data: { url: string } }).data.url
  await imageSaved
  const widthSaved = patchSaved(page)
  await page.getByTestId("image-width-small").click()
  await widthSaved
  await expect(page.getByTestId("image-preview")).toHaveAttribute("src", src)
  await expect(page.getByTestId("image-frame")).toHaveAttribute("data-width", "small")

  await page.getByTestId("copy-page").click()
  const copied = page.waitForResponse((response) => response.url().includes("/duplicate") && response.ok())
  await page.getByTestId("copy-shallow").click()
  await copied
  await expect(page.getByTestId("page-title")).toHaveValue(`${title} 副本`)
  await expect(page.getByTestId("block-input").first()).toHaveValue("配图说明")
  await expect(page.getByTestId("image-preview")).toHaveAttribute("src", src)
  await expect(page.getByTestId("image-frame")).toHaveAttribute("data-width", "small")
  const copyId = new URL(page.url()).pathname.split("/").pop() ?? ""
  expect(copyId).not.toBe(sourceId)
  await page.reload()
  await expect(page.getByTestId("image-preview")).toHaveAttribute("src", src)
  await expect(page.getByTestId("image-frame")).toHaveAttribute("data-width", "small")
  await expect(page.getByTestId("block-input").first()).toHaveValue("配图说明")

  await page.goto(`/w/${IDS.product}/p/${sourceId}`)
  await expect(page.getByTestId("page-title")).toHaveValue(title)
  await expect(page.getByTestId("block-input").first()).toHaveValue("配图说明")
  await expect(page.getByTestId("image-preview")).toHaveAttribute("src", src)
  await expect(page.getByTestId("image-frame")).toHaveAttribute("data-width", "small")
})

test("pastes a cross-block selection with marks, a link, and an empty block", async ({ page }) => {
  await login(page)
  const sourceId = await createPage(page, `粘贴边界${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  const typed = patchSaved(page)
  await input.fill("看文档吧")
  await typed
  await selectText(input, 0, 1)
  await page.getByTestId("format-bold").click()
  await selectText(input, 1, 3)
  await page.getByTestId("format-link").click()
  await page.getByTestId("link-url").fill("https://example.com/docs")
  const linked = patchSaved(page)
  await page.getByTestId("link-apply").click()
  await linked
  await expect(page.getByTestId("inline-link")).toHaveAttribute("href", "https://example.com/docs")

  const opened = patchSaved(page)
  await page.getByTestId("block-input").first().press("End")
  await page.getByTestId("block-input").first().press("Enter")
  await opened
  const emptied = patchSaved(page)
  await page.getByTestId("block-input").nth(1).press("Enter")
  await emptied
  const ended = patchSaved(page)
  await page.getByTestId("block-input").nth(2).fill("结尾")
  await ended

  await page.getByTestId("block-input").nth(2).evaluate((element) => {
    const field = element as HTMLTextAreaElement
    field.focus()
    field.setSelectionRange(0, 0)
    const press = () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true, cancelable: true }))
    press()
    press()
  })
  await expect(page.locator('[data-block-selected="true"]')).toHaveCount(3)
  await page.keyboard.press("Control+C")
  await page.waitForFunction(() => (sessionStorage.getItem("folio-clipboard") ?? "").includes("看文档吧") && (sessionStorage.getItem("folio-clipboard") ?? "").includes("结尾"))

  const created = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/workspaces\/[^/]+\/pages$/.test(new URL(response.url()).pathname) && response.ok())
  await page.getByTestId("new-page").click()
  const pastedId = ((await (await created).json()) as { data: { id: string } }).data.id
  await page.waitForURL(new RegExp(`/p/${pastedId}$`))
  const pasted = patchSaved(page)
  await page.getByTestId("block-input").first().click()
  await page.keyboard.press("Control+V")
  await pasted
  const blocks = page.getByTestId("block")
  await expect(blocks).toHaveCount(3)
  await expect(blocks.nth(0).getByTestId("block-input")).toHaveValue("看文档吧")
  await expect(blocks.nth(0).getByTestId("inline-mark").first()).toHaveAttribute("data-inline-marks", /bold/)
  await expect(blocks.nth(0).getByTestId("inline-link")).toHaveAttribute("href", "https://example.com/docs")
  await expect(blocks.nth(0).getByTestId("inline-link")).toHaveText("文档")
  await expect(blocks.nth(1).getByTestId("block-input")).toHaveValue("")
  await expect(blocks.nth(2).getByTestId("block-input")).toHaveValue("结尾")
  await page.reload()
  await expect(page.getByTestId("block").nth(0).getByTestId("block-input")).toHaveValue("看文档吧")
  await expect(page.getByTestId("block").nth(0).getByTestId("inline-mark").first()).toHaveAttribute("data-inline-marks", /bold/)
  await expect(page.getByTestId("block").nth(0).getByTestId("inline-link")).toHaveAttribute("href", "https://example.com/docs")
  await expect(page.getByTestId("block").nth(1).getByTestId("block-input")).toHaveValue("")
  await expect(page.getByTestId("block").nth(2).getByTestId("block-input")).toHaveValue("结尾")

  await page.goto(`/w/${IDS.product}/p/${sourceId}`)
  await expect(page.getByTestId("block").nth(0).getByTestId("block-input")).toHaveValue("看文档吧")
  await expect(page.getByTestId("block").nth(0).getByTestId("inline-link")).toHaveAttribute("href", "https://example.com/docs")
  await expect(page.getByTestId("block").nth(1).getByTestId("block-input")).toHaveValue("")
  await expect(page.getByTestId("block").nth(2).getByTestId("block-input")).toHaveValue("结尾")
})

test("keeps the drawer usable across portrait and landscape", async ({ page }) => {
  await login(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const sidebar = page.getByTestId("sidebar")
  const overlay = page.getByRole("button", { name: "关闭侧栏" })
  await expect(sidebar).toBeHidden()
  await page.getByTestId("nav-toggle").click()
  await expect(sidebar).toBeVisible()
  await expect(overlay).toBeVisible()

  await page.setViewportSize({ width: 700, height: 360 })
  await expect(page.getByTestId("nav-toggle")).toBeVisible()
  await expect(sidebar).toBeVisible()
  await expect(overlay).toBeVisible()
  await overlay.click()
  await expect(sidebar).toBeHidden()

  await page.setViewportSize({ width: 900, height: 400 })
  await expect(sidebar).toBeVisible()
  await expect(page.getByTestId("nav-toggle")).toBeHidden()
  await expect(overlay).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(sidebar).toBeHidden()
  await expect(page.getByTestId("nav-toggle")).toBeVisible()
  await page.getByTestId("nav-toggle").click()
  await expect(sidebar).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(sidebar).toBeHidden()
  await page.getByTestId("nav-toggle").click()
  await page.getByTestId("page-link").first().click()
  await expect(sidebar).toBeHidden()
})
