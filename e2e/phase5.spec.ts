import { expect, test, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { IDS } from "../src/lib/seed-ids"

async function login(page: Page, email: string = DEMO_USERS.nash.email) {
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

async function search(page: Page, query: string, scope: "all" | "title" | "content") {
  if (await page.getByTestId("search-input").isHidden()) {
    const opener = page.getByTestId("search-open")
    if (await opener.isVisible()) await opener.click()
    else await page.getByTestId("search-open-mobile").click()
  }
  const results = page.waitForResponse((response) => response.url().includes("/search?") && response.ok())
  if ((await page.getByTestId(`search-scope-${scope}`).getAttribute("aria-pressed")) !== "true") {
    await page.getByTestId(`search-scope-${scope}`).click()
  }
  await page.getByTestId("search-input").fill(query)
  await results
}

test("highlights matches and filters title from body", async ({ page }) => {
  await login(page)
  await createPage(page, "筛选标题词", "普通段落")
  await createPage(page, "普通页面", "筛选正文词")

  await search(page, "筛选标题词", "title")
  await expect(page.getByTestId("search-result")).toHaveCount(1)
  await expect(page.getByTestId("search-highlight").first()).toHaveText("筛选标题词")
  await expect(page.getByTestId("search-result")).toHaveAttribute("data-match", "title")

  await search(page, "筛选标题词", "content")
  await expect(page.getByTestId("search-empty")).toBeVisible()

  await search(page, "筛选正文词", "content")
  await expect(page.getByTestId("search-result")).toHaveCount(1)
  await expect(page.getByTestId("search-result")).toHaveAttribute("data-match", "content")
  await expect(page.getByTestId("search-highlight").first()).toHaveText("筛选正文词")

  await search(page, "筛选正文词", "title")
  await expect(page.getByTestId("search-empty")).toBeVisible()
})

test("hides a private page from another member in every search scope", async ({ browser }) => {
  const nashContext = await browser.newContext()
  const miaContext = await browser.newContext()
  const nash = await nashContext.newPage()
  const mia = await miaContext.newPage()
  try {
    await login(nash)
    await createPage(nash, "私有交叉词", "私有交叉正文")
    await login(mia, DEMO_USERS.mia.email)
    await mia.goto(`/w/${IDS.product}`)
    for (const scope of ["all", "title", "content"] as const) {
      await search(mia, "私有交叉", scope)
      await expect(mia.getByTestId("search-empty")).toBeVisible()
    }
    await search(nash, "私有交叉正文", "content")
    await expect(nash.getByTestId("search-result").filter({ hasText: "私有交叉词" })).toBeVisible()
    await expect(nash.getByTestId("search-highlight").first()).toHaveText("私有交叉正文")
  } finally {
    await nashContext.close()
    await miaContext.close()
  }
})

test("opens and closes the sidebar on a small screen", async ({ page }) => {
  await login(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const sidebar = page.getByTestId("sidebar")
  await expect(sidebar).toBeHidden()
  await page.getByTestId("nav-toggle").click()
  await expect(sidebar).toBeVisible()
  await expect.poll(async () => page.getByTestId("add-child").first().evaluate((element) => getComputedStyle(element).opacity)).toBe("1")
  await page.keyboard.press("Escape")
  await expect(sidebar).toBeHidden()

  await page.getByTestId("nav-toggle").click()
  await page.getByTestId("page-link").first().click()
  await expect(sidebar).toBeHidden()

  await page.getByTestId("nav-toggle").click()
  await page.getByTestId("workspace-switcher").click()
  await page.getByTestId("workspace-option").filter({ hasText: "个人空间" }).click()
  await expect(page.getByTestId("workspace-name")).toHaveText("个人空间")
  await expect(sidebar).toBeHidden()
})
