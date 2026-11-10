import { expect, test, type Browser, type Page } from "@playwright/test"
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

async function createTitledPage(page: Page, title: string) {
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

function patch(page: Page, id: string, status: number) {
  return page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.status() === status)
}

async function openPair(browser: Browser) {
  const aContext = await browser.newContext()
  const bContext = await browser.newContext()
  const a = await aContext.newPage()
  const b = await bContext.newPage()
  await login(a)
  await login(b)
  return { a, b, close: async () => { await aContext.close(); await bContext.close() } }
}

test("shows a conflict when a second session saves a title, and discard keeps the first write", async ({ browser }) => {
  const { a, b, close } = await openPair(browser)
  try {
    const id = await createTitledPage(a, "原文标题")
    await b.goto(`/w/${IDS.product}/p/${id}`)
    await expect(b.getByTestId("page-title")).toHaveValue("原文标题")
    const first = patch(a, id, 200)
    await a.getByTestId("page-title").fill("先写的标题")
    await first
    const conflict = patch(b, id, 409)
    await b.getByTestId("page-title").fill("后写的标题")
    expect((await conflict).status()).toBe(409)
    await expect(b.getByTestId("conflict-dialog")).toBeVisible()
    await expect(b.getByTestId("save-status")).toHaveText(/发现冲突/)
    const refreshed = b.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "GET" && response.ok())
    await b.getByTestId("conflict-discard").click()
    await refreshed
    await expect(b.getByTestId("page-title")).toHaveValue("先写的标题")
    await b.reload()
    await expect(b.getByTestId("page-title")).toHaveValue("先写的标题")
  } finally {
    await close()
  }
})

test("lets the later session overwrite the body after an explicit choice", async ({ browser }) => {
  const { a, b, close } = await openPair(browser)
  try {
    const id = await createTitledPage(a, "覆盖正文")
    await b.goto(`/w/${IDS.product}/p/${id}`)
    await expect(b.getByTestId("block-input").first()).toBeVisible()
    const first = patch(a, id, 200)
    await a.getByTestId("block-input").first().fill("先写的正文")
    await first
    const conflict = patch(b, id, 409)
    await b.getByTestId("block-input").first().fill("后写的正文")
    await conflict
    await expect(b.getByTestId("conflict-dialog")).toBeVisible()
    const saved = patch(b, id, 200)
    await b.getByTestId("conflict-overwrite").click()
    await saved
    await expect(b.getByTestId("block-input").first()).toHaveValue("后写的正文")
    await a.reload()
    await expect(a.getByTestId("block-input").first()).toHaveValue("后写的正文")
  } finally {
    await close()
  }
})

test("does not let the later session replace the page until a choice is made", async ({ browser }) => {
  const { a, b, close } = await openPair(browser)
  try {
    const id = await createTitledPage(a, "原标题")
    const body = patch(a, id, 200)
    await a.getByTestId("block-input").first().fill("原正文")
    await body
    await b.goto(`/w/${IDS.product}/p/${id}`)
    await expect(b.getByTestId("page-title")).toHaveValue("原标题")
    await expect(b.getByTestId("block-input").first()).toHaveValue("原正文")
    const title = patch(a, id, 200)
    await a.getByTestId("page-title").fill("必须留下")
    await title
    const conflict = patch(b, id, 409)
    await b.getByTestId("block-input").first().fill("不该覆盖的正文")
    await conflict
    await expect(b.getByTestId("conflict-dialog")).toBeVisible()
    await a.reload()
    await expect(a.getByTestId("page-title")).toHaveValue("必须留下")
    await expect(a.getByTestId("block-input").first()).toHaveValue("原正文")
  } finally {
    await close()
  }
})

test("throttles autosave and retries after a failed save", async ({ page }) => {
  await login(page)
  const id = await createTitledPage(page, "失败重试")
  let patches = 0
  page.on("request", (request) => {
    if (request.method() === "PATCH" && request.url().includes(`/api/pages/${id}`)) patches += 1
  })
  const saved = patch(page, id, 200)
  await page.getByTestId("block-input").first().pressSequentially("节流", { delay: 20 })
  await saved
  await page.waitForTimeout(800)
  expect(patches).toBe(1)
  let failed = false
  await page.route(/\/api\/pages\/[^/]+$/, async (route) => {
    if (route.request().method() === "PATCH" && !failed) {
      failed = true
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "保存失败" }) })
      return
    }
    await route.continue()
  })
  const failedSave = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.status() === 500)
  await page.getByTestId("block-input").first().fill("重试后留下")
  await failedSave
  await expect(page.getByTestId("toast")).toHaveText("保存失败")
  await expect(page.getByTestId("save-status")).toContainText("保存失败")
  const retried = patch(page, id, 200)
  await page.getByTestId("save-retry").click()
  await retried
  await expect(page.getByTestId("save-status")).toHaveText("已保存")
  await page.reload()
  await expect(page.getByTestId("block-input").first()).toHaveValue("重试后留下")
})
