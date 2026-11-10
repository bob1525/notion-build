import { expect, test, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { PAGE_MOVE_DESCENDANT, PAGE_MOVE_SELF } from "../src/lib/tree"

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

async function createWorkspace(page: Page) {
  const name = `树${Date.now()}`
  await page.getByTestId("workspace-switcher").click()
  await page.getByTestId("new-workspace").click()
  await page.getByTestId("workspace-name-input").fill(name)
  await page.getByTestId("create-workspace").click()
  await expect(page.getByTestId("workspace-name")).toHaveText(name)
}

async function createTitledPage(page: Page, title: string) {
  const created = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/workspaces\/[^/]+\/pages$/.test(new URL(response.url()).pathname) && response.ok())
  await page.getByTestId("new-page").click()
  const id = ((await (await created).json()) as { data: { id: string } }).data.id
  await page.waitForURL(new RegExp(`/p/${id}$`))
  await expect(page.getByTestId("page-title")).toHaveValue("")
  const saved = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("page-title").fill(title)
  await saved
  return id
}

async function createChild(page: Page, parentTitle: string, title: string) {
  await page.locator(`[data-testid="page-link"][data-title="${parentTitle}"]`).click()
  await expect(page.getByTestId("page-title")).toHaveValue(parentTitle)
  const created = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/workspaces\/[^/]+\/pages$/.test(new URL(response.url()).pathname) && response.ok())
  await page.getByTestId("add-subpage").click()
  const id = ((await (await created).json()) as { data: { id: string } }).data.id
  await page.waitForURL(new RegExp(`/p/${id}$`))
  await expect(page.getByTestId("page-title")).toHaveValue("")
  const saved = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("page-title").fill(title)
  await saved
  return id
}

function patchWith(page: Page, text: string) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== "PATCH" || !response.ok()) return false
    return response.request().postData()?.includes(text) ?? false
  })
}

async function rootTitles(page: Page) {
  return page.locator('[data-testid="page-link"][data-parent-id=""]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-title")))
}

function rowByTitle(page: Page, title: string) {
  return page.locator("[data-testid='page-row']").filter({ has: page.locator(`[data-testid="page-link"][data-title="${title}"]`) })
}

async function dragPage(page: Page, from: string, to: string, placement: "before" | "after" | "inside") {
  const handle = rowByTitle(page, from).getByTestId("page-drag")
  const target = rowByTitle(page, to)
  const handleBox = await handle.boundingBox()
  const rowBox = await target.boundingBox()
  if (!handleBox || !rowBox) throw new Error("页面拖拽没有布局")
  const yRatio = placement === "before" ? 0.12 : placement === "after" ? 0.88 : 0.5
  const moved = page.waitForResponse((response) => response.url().includes("/pages/move") && response.request().method() === "POST")
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rowBox.x + Math.min(140, rowBox.width / 2), rowBox.y + rowBox.height * yRatio, { steps: 18 })
  await expect(page.getByTestId("page-drop-indicator")).toHaveAttribute("data-placement", placement)
  await expect(page.getByTestId("page-drop-indicator")).toHaveAttribute("data-blocked", "false")
  await page.mouse.up()
  expect((await moved).ok()).toBeTruthy()
}

test.beforeEach(async ({ page }) => {
  await login(page)
  await createWorkspace(page)
})

test("drags a page to the first position among siblings", async ({ page }) => {
  await createTitledPage(page, "甲")
  await createTitledPage(page, "乙")
  await createTitledPage(page, "丙")
  await dragPage(page, "丙", "甲", "before")
  await expect.poll(() => rootTitles(page)).toEqual(["丙", "甲", "乙"])
})

test("drags a page to the last position among siblings", async ({ page }) => {
  await createTitledPage(page, "甲")
  await createTitledPage(page, "乙")
  await createTitledPage(page, "丙")
  await dragPage(page, "甲", "丙", "after")
  await expect.poll(() => rootTitles(page)).toEqual(["乙", "丙", "甲"])
})

test("drags a page to the middle of its siblings", async ({ page }) => {
  await createTitledPage(page, "甲")
  await createTitledPage(page, "乙")
  await createTitledPage(page, "丙")
  await dragPage(page, "丙", "乙", "before")
  await expect.poll(() => rootTitles(page)).toEqual(["甲", "丙", "乙"])
})

test("drops a page inside another page so it becomes a child", async ({ page }) => {
  await createTitledPage(page, "甲")
  await createTitledPage(page, "乙")
  await createTitledPage(page, "丙")
  await dragPage(page, "丙", "甲", "inside")
  const parentId = await page.locator('[data-testid="page-link"][data-title="甲"]').getAttribute("data-page-id")
  await expect(page.locator('[data-testid="page-link"][data-title="丙"]')).toHaveAttribute("data-parent-id", parentId ?? "")
  await expect.poll(() => rootTitles(page)).toEqual(["甲", "乙"])
})

test("drags a child out so it sits beside its old parent", async ({ page }) => {
  await createTitledPage(page, "甲")
  await createChild(page, "甲", "乙")
  await dragPage(page, "乙", "甲", "before")
  await expect(page.locator('[data-testid="page-link"][data-title="乙"]')).toHaveAttribute("data-parent-id", "")
  await expect.poll(() => rootTitles(page)).toEqual(["乙", "甲"])
})

test("blocks a drop onto the page itself and explains why", async ({ page }) => {
  await createTitledPage(page, "甲")
  await createTitledPage(page, "乙")
  const handle = rowByTitle(page, "乙").getByTestId("page-drag")
  const box = await handle.boundingBox()
  if (!box) throw new Error("页面拖拽没有布局")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 12 })
  await expect(page.getByTestId("page-move-error")).toHaveText(PAGE_MOVE_SELF)
  await page.mouse.up()
  await expect(page.getByTestId("toast")).toHaveText(PAGE_MOVE_SELF)
  await expect.poll(() => rootTitles(page)).toEqual(["甲", "乙"])
})

test("blocks a drop into a descendant and keeps the tree", async ({ page }) => {
  await createTitledPage(page, "甲")
  const childId = await createChild(page, "甲", "乙")
  const parentId = await page.locator('[data-testid="page-link"][data-title="甲"]').getAttribute("data-page-id")
  await dragBlocked(page, "甲", "乙", "inside", PAGE_MOVE_DESCENDANT)
  await expect(page.locator(`[data-testid="page-link"][data-page-id="${childId}"]`)).toHaveAttribute("data-parent-id", parentId ?? "")
  await expect.poll(() => rootTitles(page)).toEqual(["甲"])
})

test("keeps a dragged order after reload", async ({ page }) => {
  await createTitledPage(page, "甲")
  await createTitledPage(page, "乙")
  await createTitledPage(page, "丙")
  await dragPage(page, "甲", "丙", "after")
  await expect.poll(() => rootTitles(page)).toEqual(["乙", "丙", "甲"])
  await page.reload()
  await expect(page.getByTestId("sidebar")).toBeVisible()
  await expect.poll(() => rootTitles(page)).toEqual(["乙", "丙", "甲"])
})

test("copies one page without its children and keeps the full body", async ({ page }) => {
  const parentId = await createTitledPage(page, "甲")
  await writeBody(page, "正文甲", "待办甲")
  const childId = await createChild(page, "甲", "乙")
  const childSaved = patchWith(page, "正文乙")
  await page.getByTestId("block-input").first().fill("正文乙")
  await childSaved
  await page.locator(`[data-testid="page-link"][data-page-id="${parentId}"]`).click()
  await expect(page.getByTestId("page-title")).toHaveValue("甲")
  await page.getByTestId("copy-page").click()
  const copied = page.waitForResponse((response) => response.url().includes("/duplicate") && response.ok())
  await page.getByTestId("copy-shallow").click()
  await copied
  await expect(page.getByTestId("page-title")).toHaveValue("甲 副本")
  await expect(page.getByTestId("block-input").nth(0)).toHaveValue("正文甲")
  await expect(page.getByTestId("block-input").nth(1)).toHaveValue("待办甲")
  const copyId = new URL(page.url()).pathname.split("/").pop() ?? ""
  await expect(page.locator(`[data-testid="page-link"][data-parent-id="${copyId}"]`)).toHaveCount(0)
  await expect(page.locator(`[data-testid="page-link"][data-page-id="${childId}"]`)).toHaveAttribute("data-parent-id", parentId)
  await page.locator(`[data-testid="page-link"][data-page-id="${parentId}"]`).click()
  await expect(page.getByTestId("block-input").nth(0)).toHaveValue("正文甲")
  await expect(page.getByTestId("block-input").nth(1)).toHaveValue("待办甲")
})

test("copies a page together with its children", async ({ page }) => {
  const parentId = await createTitledPage(page, "甲")
  await writeBody(page, "正文甲", "待办甲")
  const childId = await createChild(page, "甲", "乙")
  const childSaved = patchWith(page, "正文乙")
  await page.getByTestId("block-input").first().fill("正文乙")
  await childSaved
  await page.locator(`[data-testid="page-link"][data-page-id="${parentId}"]`).click()
  await expect(page.getByTestId("page-title")).toHaveValue("甲")
  await page.getByTestId("copy-page").click()
  const copied = page.waitForResponse((response) => response.url().includes("/duplicate") && response.ok())
  await page.getByTestId("copy-deep").click()
  await copied
  await expect(page.getByTestId("page-title")).toHaveValue("甲 副本")
  const copyId = new URL(page.url()).pathname.split("/").pop() ?? ""
  const copiedChild = page.locator(`[data-testid="page-link"][data-parent-id="${copyId}"]`)
  await expect(copiedChild).toHaveCount(1)
  await expect(copiedChild).toHaveAttribute("data-title", "乙")
  await expect(page.locator(`[data-testid="page-link"][data-page-id="${childId}"]`)).toHaveAttribute("data-parent-id", parentId)
  await copiedChild.click()
  await expect(page.getByTestId("page-title")).toHaveValue("乙")
  await expect(page.getByTestId("block-input").first()).toHaveValue("正文乙")
  await page.locator(`[data-testid="page-link"][data-page-id="${childId}"]`).click()
  await expect(page.getByTestId("block-input").first()).toHaveValue("正文乙")
})

async function dragBlocked(page: Page, from: string, to: string, placement: "before" | "after" | "inside", message: string) {
  const handle = rowByTitle(page, from).getByTestId("page-drag")
  const target = rowByTitle(page, to)
  const handleBox = await handle.boundingBox()
  const rowBox = await target.boundingBox()
  if (!handleBox || !rowBox) throw new Error("页面拖拽没有布局")
  const yRatio = placement === "before" ? 0.12 : placement === "after" ? 0.88 : 0.5
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rowBox.x + Math.min(140, rowBox.width / 2), rowBox.y + rowBox.height * yRatio, { steps: 18 })
  await expect(page.getByTestId("page-drop-indicator")).toHaveAttribute("data-placement", placement)
  await expect(page.getByTestId("page-drop-indicator")).toHaveAttribute("data-blocked", "true")
  await expect(page.getByTestId("page-move-error")).toHaveText(message)
  await page.mouse.up()
  await expect(page.getByTestId("toast")).toHaveText(message)
}

async function writeBody(page: Page, paragraph: string, todo: string) {
  const first = page.getByTestId("block-input").first()
  const firstSaved = patchWith(page, paragraph)
  await first.fill(paragraph)
  await firstSaved
  await first.press("Enter")
  const second = page.getByTestId("block-input").nth(1)
  await second.fill("/待办")
  await expect(page.getByTestId("slash-todo")).toBeVisible()
  await page.getByTestId("slash-todo").click()
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-block-type", "todo")
  const todoSaved = patchWith(page, todo)
  await page.getByTestId("block").nth(1).getByTestId("block-input").fill(todo)
  await todoSaved
}
