import { expect, test, type Page } from "@playwright/test"
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

test.beforeEach(async ({ page }) => {
  await login(page)
})

test("creates and edits a quote", async ({ page }) => {
  await createPage(page, `引用${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  await input.fill("/引用")
  await page.getByTestId("slash-quote").click()
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "quote")
  const saved = patchSaved(page)
  await input.fill("被引用的话")
  await saved
  await page.reload()
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "quote")
  await expect(page.getByTestId("block-input").first()).toHaveValue("被引用的话")
  await expect(page.locator(".folio-quote")).toBeVisible()
})

test("nests content inside a quote and keeps it after reload", async ({ page }) => {
  await createPage(page, `引用嵌套${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  await input.fill("/引用")
  await page.getByTestId("slash-quote").click()
  await input.fill("外层")
  const saved = patchSaved(page)
  await page.getByTestId("add-nested").click()
  await saved
  const nested = page.getByTestId("quote-children").getByTestId("block-input")
  const nestedSaved = patchSaved(page)
  await nested.fill("内层段落")
  await nestedSaved
  await page.reload()
  await expect(page.getByTestId("quote-children").getByTestId("block-input")).toHaveValue("内层段落")
  await expect(page.getByTestId("block-input").first()).toHaveValue("外层")
})

test("creates and edits a toggle title", async ({ page }) => {
  await createPage(page, `折叠${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  await input.fill("/折叠")
  await page.getByTestId("slash-toggle").click()
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "toggle")
  const saved = patchSaved(page)
  await input.fill("可收起的标题")
  await saved
  await page.reload()
  await expect(page.getByTestId("block-input").first()).toHaveValue("可收起的标题")
  await expect(page.getByTestId("toggle-collapse")).toHaveAttribute("aria-expanded", "true")
})

test("remembers whether a toggle is collapsed", async ({ page }) => {
  await createPage(page, `折叠记忆${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  await input.fill("/折叠")
  await page.getByTestId("slash-toggle").click()
  await input.fill("标题")
  const added = patchSaved(page)
  await page.getByTestId("add-nested").click()
  await added
  const nestedSaved = patchSaved(page)
  await page.getByTestId("toggle-body").getByTestId("block-input").fill("藏起来")
  await nestedSaved
  const collapsed = patchSaved(page)
  await page.getByTestId("toggle-collapse").click()
  await collapsed
  await expect(page.getByTestId("toggle-body")).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId("toggle-collapse")).toHaveAttribute("aria-expanded", "false")
  await expect(page.getByTestId("toggle-body")).toHaveCount(0)
  await page.getByTestId("toggle-collapse").click()
  await expect(page.getByTestId("toggle-body").getByTestId("block-input")).toHaveValue("藏起来")
})

test("uploads a local image and shows it", async ({ page }) => {
  await createPage(page, `上传图片${Date.now()}`)
  await page.getByTestId("block-input").first().fill("/图片")
  await page.getByTestId("slash-image").click()
  const uploaded = page.waitForResponse((response) => response.url().includes("/api/uploads") && response.request().method() === "POST")
  await page.getByTestId("image-file").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG })
  expect((await uploaded).ok()).toBeTruthy()
  await expect(page.getByTestId("image-preview")).toHaveAttribute("src", /\/uploads\/.+\.png/)
  await expect(page.getByTestId("save-status")).toHaveText("已保存")
  const src = await page.getByTestId("image-preview").getAttribute("src")
  await page.reload()
  await expect(page.getByTestId("image-preview")).toHaveAttribute("src", src ?? "")
})

test("shows an error when the upload is not an image", async ({ page }) => {
  await createPage(page, `上传失败${Date.now()}`)
  await page.getByTestId("block-input").first().fill("/图片")
  await page.getByTestId("slash-image").click()
  const uploaded = page.waitForResponse((response) => response.url().includes("/api/uploads") && response.request().method() === "POST")
  await page.getByTestId("image-file").setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("hello") })
  expect((await uploaded).ok()).toBeFalsy()
  await expect(page.getByTestId("image-error")).toContainText("只能上传图片")
  await expect(page.getByTestId("image-preview")).toHaveCount(0)
})

test("rejects an invalid image url", async ({ page }) => {
  await createPage(page, `无效图片${Date.now()}`)
  await page.getByTestId("block-input").first().fill("/图片")
  await page.getByTestId("slash-image").click()
  await page.getByTestId("image-url").fill("notaurl")
  await page.getByTestId("image-url-submit").click()
  await expect(page.getByTestId("image-error")).toContainText("图片地址无效")
  await expect(page.getByTestId("image-preview")).toHaveCount(0)
})

test("switches an image between small, medium, and large", async ({ page }) => {
  await createPage(page, `图片尺寸${Date.now()}`)
  await page.getByTestId("block-input").first().fill("/图片")
  await page.getByTestId("slash-image").click()
  const saved = patchSaved(page)
  await page.getByTestId("image-url").fill("https://example.com/a.png")
  await page.getByTestId("image-url-submit").click()
  await saved
  await expect(page.getByTestId("image-frame")).toHaveAttribute("data-width", "medium")
  const small = patchSaved(page)
  await page.getByTestId("image-width-small").click()
  await small
  await expect(page.getByTestId("image-frame")).toHaveAttribute("data-width", "small")
  const large = patchSaved(page)
  await page.getByTestId("image-width-large").click()
  await large
  await expect(page.getByTestId("image-frame")).toHaveAttribute("data-width", "large")
  await page.reload()
  await expect(page.getByTestId("image-frame")).toHaveAttribute("data-width", "large")
})

test("highlights javascript, python, and css after the language changes", async ({ page }) => {
  await createPage(page, `高亮${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  await input.pressSequentially("```")
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "code")
  const js = patchSaved(page)
  await page.getByTestId("code-language").selectOption("javascript")
  await input.fill("const n = 1")
  await js
  await expect(page.locator("[data-token='keyword']")).toHaveText("const")
  await page.getByTestId("code-language").selectOption("css")
  await expect(page.locator("[data-token='keyword']")).toHaveCount(0)
  const python = patchSaved(page)
  await page.getByTestId("code-language").selectOption("python")
  await input.fill("def greet():\n    return 1")
  await python
  await expect(page.locator("[data-token='keyword']").first()).toHaveText("def")
  await expect(page.locator("[data-token='keyword']").nth(1)).toHaveText("return")
  await expect(page.locator("[data-token='number']")).toHaveText("1")
  await expect(page.getByTestId("save-status")).toHaveText("已保存")
  await page.reload()
  await expect(page.locator("[data-token='keyword']").first()).toHaveText("def")
})

test("renders one stable divider", async ({ page }) => {
  await createPage(page, `分割线${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  await input.fill("--")
  const saved = patchSaved(page)
  await input.press("-")
  await saved
  await expect(page.getByTestId("divider-rule")).toHaveCount(1)
  await expect(page.getByTestId("divider-rule")).toHaveClass(/folio-divider/)
  await page.reload()
  await expect(page.getByTestId("divider-rule")).toHaveCount(1)
  await expect(page.getByTestId("divider-rule")).toHaveClass(/folio-divider/)
})
