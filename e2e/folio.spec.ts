import { expect, test, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { IDS, SEARCH_WORDS, TITLES, WORKSPACES } from "../src/lib/seed-ids"

async function login(page: Page, email: string, password = DEMO_USERS.nash.password) {
  await page.goto("/login")
  await page.getByTestId("login-email").fill(email)
  await page.getByTestId("login-password").fill(password)
  await page.getByTestId("login-submit").click()
  await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 })
}

async function createPage(page: Page, title: string) {
  await page.getByTestId("new-page").click()
  await expect(page.getByTestId("page-title")).toHaveValue("")
  await page.waitForURL(/\/p\/[^/]+$/)
  const id = new URL(page.url()).pathname.split("/").pop()
  const saved = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("page-title").fill(title)
  await saved
}

test("shows an error for a wrong password", async ({ page }) => {
  await page.goto("/login")
  await page.getByTestId("login-email").fill(DEMO_USERS.nash.email)
  await page.getByTestId("login-password").fill("not-the-password")
  await page.getByTestId("login-submit").click()
  await expect(page.getByTestId("login-error")).toContainText("邮箱或密码不正确")
})

test("registers a new account into a starter workspace", async ({ page }) => {
  const stamp = Date.now()
  await page.goto("/register")
  await page.getByTestId("register-name").fill(`访客${stamp}`)
  await page.getByTestId("register-email").fill(`guest-${stamp}@folio.dev`)
  await page.getByTestId("register-password").fill("folio-demo")
  await page.getByTestId("register-submit").click()
  await expect(page.getByTestId("workspace-name")).toContainText("的空间")
  await expect(page.getByTestId("page-link").filter({ hasText: "开始使用" })).toBeVisible()
  await page.getByTestId("page-link").filter({ hasText: "开始使用" }).click()
  await expect(page.getByTestId("page-title")).toHaveValue("开始使用")
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "paragraph")
})

test("creates a nested page and edits blocks", async ({ page }) => {
  await login(page, DEMO_USERS.nash.email)
  await page.goto(`/w/${IDS.product}`)
  const parentTitle = `父页面${Date.now()}`
  await createPage(page, parentTitle)
  const parentUrl = page.url()
  const parentId = parentUrl.split("/").pop()

  await page.getByTestId("block-input").first().click()
  await page.getByTestId("block-input").first().pressSequentially("#")
  await page.getByTestId("block-input").first().press(" ")
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "heading1")
  await page.getByTestId("block-input").first().pressSequentially("今天的标题")
  await page.getByTestId("block-input").first().press("Enter")
  await page.getByTestId("block-input").nth(1).fill("端到端写下的段落")
  await page.getByTestId("block-input").nth(1).press("Enter")
  await page.getByTestId("block-input").nth(2).fill("/待办")
  await expect(page.getByTestId("slash-todo")).toBeVisible()
  await page.getByTestId("slash-todo").click()
  await expect(page.getByTestId("block").nth(2)).toHaveAttribute("data-block-type", "todo")
  const todo = page.getByTestId("block").nth(2).getByTestId("block-input")
  await todo.fill("买笔记本")
  await page.getByTestId("block").nth(2).getByTestId("todo-toggle").check()
  await page.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())

  await page.reload()
  await expect(page.getByTestId("block-input").nth(0)).toHaveValue("今天的标题")
  await expect(page.getByTestId("block").nth(0)).toHaveAttribute("data-block-type", "heading1")
  await expect(page.getByTestId("block-input").nth(1)).toHaveValue("端到端写下的段落")
  await expect(page.getByTestId("block").nth(2).getByTestId("todo-toggle")).toBeChecked()

  await page.getByTestId("add-subpage").click()
  await expect(page.getByTestId("page-title")).toHaveValue("")
  const childTitle = `子页面${Date.now()}`
  await page.getByTestId("page-title").fill(childTitle)
  await page.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())
  const child = page.getByTestId("page-link").filter({ hasText: childTitle })
  await expect(child).toBeVisible()
  await expect(child).toHaveAttribute("data-parent-id", parentId ?? "")
})

test("searches by title and by private content", async ({ browser }) => {
  const nashContext = await browser.newContext()
  const nash = await nashContext.newPage()
  await login(nash, DEMO_USERS.nash.email)
  await nash.goto(`/w/${IDS.product}`)
  await nash.getByTestId("search-open").click()
  await nash.getByTestId("search-input").fill(TITLES.q4)
  await expect(nash.getByTestId("search-result").filter({ hasText: TITLES.q4 })).toBeVisible()
  await nash.getByTestId("search-result").filter({ hasText: TITLES.q4 }).click()
  await expect(nash.getByTestId("page-title")).toHaveValue(TITLES.q4)

  await nash.getByTestId("search-open").click()
  await nash.getByTestId("search-input").fill(SEARCH_WORDS.code)
  await expect(nash.getByTestId("search-result").filter({ hasText: TITLES.welcome })).toBeVisible()
  await nash.getByTestId("search-input").fill(SEARCH_WORDS.draft)
  await expect(nash.getByTestId("search-result").filter({ hasText: TITLES.draft })).toBeVisible()
  await nash.getByTestId("search-input").fill(SEARCH_WORDS.mia)
  await expect(nash.getByTestId("search-empty")).toBeVisible()
  await nashContext.close()

  const miaContext = await browser.newContext()
  const mia = await miaContext.newPage()
  await login(mia, DEMO_USERS.mia.email)
  await mia.goto(`/w/${IDS.product}`)
  await mia.getByTestId("search-open").click()
  await mia.getByTestId("search-input").fill(SEARCH_WORDS.draft)
  await expect(mia.getByTestId("search-empty")).toBeVisible()
  await mia.getByTestId("search-input").fill(SEARCH_WORDS.mia)
  await expect(mia.getByTestId("search-result").filter({ hasText: TITLES.miaPrivate })).toBeVisible()
  await expect(mia.getByTestId("page-link").filter({ hasText: TITLES.draft })).toHaveCount(0)
  await miaContext.close()
})

test("switches workspaces and keeps their pages apart", async ({ page }) => {
  await login(page, DEMO_USERS.nash.email)
  await page.goto(`/w/${IDS.product}`)
  await expect(page.getByTestId("workspace-name")).toHaveText(WORKSPACES.product.name)
  await expect(page.getByTestId("page-link").filter({ hasText: TITLES.welcome })).toBeVisible()

  await page.getByTestId("workspace-switcher").click()
  await page.getByTestId("workspace-option").filter({ hasText: WORKSPACES.personal.name }).click()
  await expect(page.getByTestId("workspace-name")).toHaveText(WORKSPACES.personal.name)
  await expect(page.getByTestId("page-link").filter({ hasText: TITLES.reading })).toBeVisible()
  await expect(page.getByTestId("page-link").filter({ hasText: TITLES.welcome })).toHaveCount(0)

  await page.getByTestId("workspace-switcher").click()
  await page.getByTestId("workspace-option").filter({ hasText: WORKSPACES.research.name }).click()
  await expect(page.getByTestId("page-link").filter({ hasText: TITLES.survey })).toBeVisible()
  await expect(page.getByTestId("page-link").filter({ hasText: TITLES.reading })).toHaveCount(0)
})

test("favorites, pins, markdown, and an empty workspace", async ({ page }) => {
  await login(page, DEMO_USERS.nash.email)
  await page.goto(`/w/${IDS.product}/p/${IDS.meetings}`)
  const favorite = page.getByTestId("favorite-button")
  await expect(favorite).toHaveAttribute("aria-pressed", "false")
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/favorite") && response.ok()),
    favorite.click(),
  ])
  await expect(favorite).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("favorite-link").filter({ hasText: TITLES.meetings })).toBeVisible()
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/favorite") && response.ok()),
    favorite.click(),
  ])
  await expect(favorite).toHaveAttribute("aria-pressed", "false")

  const pin = page.getByTestId("pin-button")
  const wasPinned = (await pin.getAttribute("aria-pressed")) === "true"
  await pin.click()
  await page.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())
  await expect(page.getByTestId("page-link").filter({ hasText: TITLES.meetings })).toHaveAttribute("data-pinned", wasPinned ? "false" : "true")
  await pin.click()
  await page.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())

  await page.getByTestId("new-page").click()
  await expect(page.getByTestId("page-title")).toHaveValue("")
  await page.waitForURL(/\/p\/(?!page_meetings$)[^/]+$/)
  const createdId = new URL(page.url()).pathname.split("/").pop()
  await page.getByTestId("mode-markdown").click()
  const markdownSaved = page.waitForResponse((response) => {
    if (!response.url().includes(`/api/pages/${createdId}`) || response.request().method() !== "PATCH" || !response.ok()) return false
    const body = response.request().postData() ?? ""
    return body.includes('"type":"heading1"') && body.includes("会议改写")
  })
  await page.getByTestId("markdown-source").fill("# 会议改写\n\n- [x] 已同步到预览\n")
  await expect(page.getByTestId("markdown-preview")).toContainText("会议改写")
  await expect(page.getByTestId("markdown-preview")).toContainText("已同步到预览")
  await markdownSaved
  await page.getByTestId("mode-blocks").click()
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "heading1")
  await expect(page.getByTestId("block-input").nth(1)).toHaveValue("已同步到预览")

  const workspaceName = `空白${Date.now()}`
  await page.getByTestId("workspace-switcher").click()
  await page.getByTestId("new-workspace").click()
  await page.getByTestId("workspace-name-input").fill(workspaceName)
  await page.getByTestId("create-workspace").click()
  await expect(page.getByTestId("workspace-name")).toHaveText(workspaceName)
  await expect(page.getByTestId("empty-state")).toBeVisible()
})

test("hides a private page from another member until it is public", async ({ browser }) => {
  const nashContext = await browser.newContext()
  const nash = await nashContext.newPage()
  await login(nash, DEMO_USERS.nash.email)
  await nash.goto(`/w/${IDS.product}`)
  const title = `权限${Date.now()}`
  await createPage(nash, title)
  await expect(nash.getByTestId("visibility-control")).toHaveAttribute("data-visibility", "private")
  const url = nash.url()

  const miaContext = await browser.newContext()
  const mia = await miaContext.newPage()
  await login(mia, DEMO_USERS.mia.email)
  await mia.goto(url)
  await expect(mia.getByTestId("forbidden")).toBeVisible()

  await nash.getByTestId("visibility-public").click()
  await nash.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())
  await mia.goto(url)
  await expect(mia.getByTestId("page-title")).toHaveValue(title)
  await miaContext.close()
  await nashContext.close()
})

test("serves a public share link and hides a private one", async ({ page }) => {
  await page.goto(`/share/${IDS.welcome}`)
  await expect(page.getByRole("heading", { name: TITLES.welcome })).toBeVisible()
  await expect(page.getByText("wordCount")).toBeVisible()
  await page.goto(`/share/${IDS.draft}`)
  await expect(page.getByTestId("share-missing")).toBeVisible()
})
