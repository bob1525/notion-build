import { expect, test, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"

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

async function createTitledPage(page: Page, title: string) {
  const created = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/workspaces\/[^/]+\/pages$/.test(new URL(response.url()).pathname) && response.ok())
  await page.getByTestId("new-page").click()
  const id = ((await (await created).json()) as { data: { id: string } }).data.id
  await page.waitForURL(new RegExp(`/p/${id}$`))
  const saved = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("page-title").fill(title)
  await saved
  return id
}

async function setVisibility(page: Page, level: "private" | "read" | "public") {
  const saved = page.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId(`visibility-${level}`).click()
  await saved
  await expect(page.getByTestId("visibility-control")).toHaveAttribute("data-visibility", level)
}

async function writeStatus(page: Page, id: string, title: string) {
  return page.evaluate(async ({ id, title }) => {
    const loadedResponse = await fetch(`/api/pages/${id}`)
    const loaded = loadedResponse.ok
      ? ((await loadedResponse.json()) as { data: { icon: string; cover: string; visibility: string; pinned: boolean; revision: number; blocks: unknown[] } }).data
      : null
    const response = await fetch(`/api/pages/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        icon: loaded?.icon ?? "📄",
        cover: loaded?.cover ?? "",
        visibility: loaded?.visibility ?? "private",
        pinned: loaded?.pinned ?? false,
        baseRevision: loaded?.revision ?? 0,
        overwrite: false,
        blocks: loaded?.blocks ?? [{ id: "probe", type: "paragraph", content: "改", checked: false, language: "", marks: [], parentId: "", collapsed: false, src: "", width: "" }],
      }),
    })
    return response.status
  }, { id, title })
}

test("splits public into read-only and editable, and enforces both", async ({ browser }) => {
  const nashContext = await browser.newContext()
  const nash = await nashContext.newPage()
  await login(nash, DEMO_USERS.nash.email)
  const title = `权限${Date.now()}`
  const id = await createTitledPage(nash, title)
  const url = nash.url()
  await expect(nash.getByTestId("visibility-control")).toHaveAttribute("data-visibility", "private")

  const miaContext = await browser.newContext()
  const mia = await miaContext.newPage()
  await login(mia, DEMO_USERS.mia.email)
  await mia.goto(url)
  await expect(mia.getByTestId("forbidden")).toBeVisible()
  expect(await writeStatus(mia, id, `${title}改`)).toBe(403)

  await setVisibility(nash, "read")
  await expect(nash.getByTestId("block-input").first()).toBeVisible()
  await mia.goto(url)
  await expect(mia.getByTestId("page-title")).toHaveValue(title)
  await expect(mia.getByTestId("page-readonly")).toBeVisible()
  await expect(mia.getByTestId("block-input")).toHaveCount(0)
  expect(await writeStatus(mia, id, `${title}改`)).toBe(403)
  await mia.goto(`/share/${id}`)
  await expect(mia.getByRole("heading", { name: title })).toBeVisible()
  await expect(mia.getByText("公开只读")).toBeVisible()

  await setVisibility(nash, "public")
  await mia.goto(url)
  await expect(mia.getByTestId("page-readonly")).toHaveCount(0)
  await expect(mia.getByTestId("block-input").first()).toBeEditable()
  const saved = mia.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok() && (response.request().postData()?.includes("访客写入") ?? false))
  await mia.getByTestId("block-input").first().fill("访客写入")
  await saved
  await expect(mia.getByTestId("visibility-public")).toBeDisabled()
  await expect(mia.getByTestId("delete-page")).toHaveCount(0)

  await nash.reload()
  await expect(nash.getByTestId("block-input").first()).toHaveValue("访客写入")
  await setVisibility(nash, "private")
  await mia.goto(url)
  await expect(mia.getByTestId("forbidden")).toBeVisible()
  await miaContext.close()
  await nashContext.close()
})

test("keeps a collapsed sidebar branch for the same user on another device", async ({ browser }) => {
  const firstContext = await browser.newContext()
  const first = await firstContext.newPage()
  await login(first, DEMO_USERS.nash.email)
  const name = `树${Date.now()}`
  await first.getByTestId("workspace-switcher").click()
  await first.getByTestId("new-workspace").click()
  await first.getByTestId("workspace-name-input").fill(name)
  await first.getByTestId("create-workspace").click()
  await expect(first.getByTestId("workspace-name")).toHaveText(name)
  await createTitledPage(first, "甲")
  const parentPath = new URL(first.url()).pathname
  const createdChild = first.waitForResponse((response) => response.request().method() === "POST" && /\/api\/workspaces\/[^/]+\/pages$/.test(new URL(response.url()).pathname) && response.ok())
  await first.getByTestId("add-subpage").click()
  const childId = ((await (await createdChild).json()) as { data: { id: string } }).data.id
  await first.waitForURL(new RegExp(`/p/${childId}$`))
  const childSaved = first.waitForResponse((response) => response.url().includes(`/api/pages/${childId}`) && response.request().method() === "PATCH" && response.ok())
  await first.getByTestId("page-title").fill("乙")
  await childSaved
  await expect(first).not.toHaveURL(new RegExp(`${parentPath}$`))
  await expect(first.locator('[data-testid="page-link"][data-title="乙"]')).toBeVisible()
  const collapsed = first.waitForResponse((response) => response.url().includes("/api/me/ui") && response.request().method() === "PUT" && response.ok())
  await first.getByTestId("toggle-children").click()
  await collapsed
  await expect(first.locator('[data-testid="page-link"][data-title="乙"]')).toHaveCount(0)
  const workspaceId = new URL(first.url()).pathname.split("/")[2]

  const secondContext = await browser.newContext()
  const second = await secondContext.newPage()
  await login(second, DEMO_USERS.nash.email)
  await second.goto(`/w/${workspaceId}`)
  await expect(second.locator('[data-testid="page-link"][data-title="甲"]')).toBeVisible()
  await expect(second.locator('[data-testid="page-link"][data-title="乙"]')).toHaveCount(0)
  await secondContext.close()
  await firstContext.close()
})
