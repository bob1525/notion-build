import { readFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"
import { expect, test, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { IDS } from "../src/lib/seed-ids"

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const text = readFileSync(".env", "utf8")
  const line = text.split("\n").find((item) => item.trim().startsWith("DATABASE_URL="))
  if (!line) throw new Error("DATABASE_URL missing")
  return line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")
}

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

function patch(page: Page, id: string) {
  return page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
}

async function setVisibility(page: Page, level: "private" | "read" | "public") {
  const saved = page.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId(`visibility-${level}`).click()
  await saved
  await expect(page.getByTestId("visibility-control")).toHaveAttribute("data-visibility", level)
}

test("shows who else is on the page and refreshes before a second edit", async ({ browser }) => {
  const nashContext = await browser.newContext()
  const miaContext = await browser.newContext()
  const nash = await nashContext.newPage()
  const mia = await miaContext.newPage()
  try {
    await login(nash, DEMO_USERS.nash.email)
    const id = await createTitledPage(nash, "在线页")
    await setVisibility(nash, "public")
    const url = nash.url()

    await login(mia, DEMO_USERS.mia.email)
    await mia.goto(url)
    const nashOnMia = mia.locator('[data-testid="presence-peer"][data-user-name="Nash"]')
    await expect(nashOnMia).toBeVisible({ timeout: 15_000 })
    const editingBeat = nash.waitForResponse((response) => {
      return response.request().method() === "POST" && new URL(response.url()).pathname === `/api/pages/${id}/presence` && (response.request().postData()?.includes('"editing"') ?? false) && response.ok()
    })
    await nash.getByTestId("page-title").click()
    await editingBeat
    await expect(nashOnMia).toHaveAttribute("data-activity", "editing", { timeout: 12_000 })
    await expect(nashOnMia).toContainText("正在编辑")
    await expect(mia.locator('[data-testid="presence-peer"][data-user-name="Mia"]')).toHaveCount(0)

    const saved = patch(nash, id)
    await nash.getByTestId("page-title").fill("新版本标题")
    await saved
    await expect(mia.getByTestId("presence-fresh")).toBeVisible({ timeout: 12_000 })
    await expect(mia.getByTestId("presence-fresh")).toContainText("有新版本")
    await mia.getByTestId("presence-refresh").click()
    await expect(mia.getByTestId("page-title")).toHaveValue("新版本标题")
    await expect(mia.getByTestId("presence-fresh")).toHaveCount(0)

    const miaSaved = patch(mia, id)
    await mia.getByTestId("page-title").fill("刷新后改的")
    await miaSaved
    await expect(mia.getByTestId("conflict-dialog")).toHaveCount(0)
    await expect(mia.getByTestId("save-status")).toHaveText("已保存")
  } finally {
    await nashContext.close().catch(() => {})
    await miaContext.close().catch(() => {})
  }
})

test("keeps a read-only member as viewing and hides people on the share page", async ({ browser }) => {
  const nashContext = await browser.newContext()
  const miaContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const nash = await nashContext.newPage()
  const mia = await miaContext.newPage()
  const guest = await guestContext.newPage()
  try {
    await login(nash, DEMO_USERS.nash.email)
    const id = await createTitledPage(nash, "只读在线")
    await login(mia, DEMO_USERS.mia.email)
    const denied = await mia.evaluate(async (pageId) => {
      const response = await fetch(`/api/pages/${pageId}/presence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity: "editing" }),
      })
      return response.status
    }, id)
    expect(denied).toBe(403)

    await setVisibility(nash, "read")
    await mia.goto(nash.url())
    await expect(mia.getByTestId("page-readonly")).toBeVisible()
    const claimedEditing = mia.waitForResponse((response) => {
      return response.request().method() === "POST" && new URL(response.url()).pathname === `/api/pages/${id}/presence` && (response.request().postData()?.includes('"editing"') ?? false) && response.ok()
    })
    await mia.getByTestId("page-title").focus()
    await claimedEditing
    const miaOnNash = nash.locator('[data-testid="presence-peer"][data-user-name="Mia"]')
    await expect(miaOnNash).toBeVisible({ timeout: 15_000 })
    await expect(miaOnNash).toHaveAttribute("data-activity", "viewing", { timeout: 12_000 })
    await expect(miaOnNash).toContainText("正在查看")

    await guest.goto(`/share/${id}`)
    await expect(guest.getByRole("heading", { name: "只读在线" })).toBeVisible()
    await expect(guest.getByTestId("presence-peer")).toHaveCount(0)
    await expect(guest.getByTestId("presence-fresh")).toHaveCount(0)
  } finally {
    await nashContext.close().catch(() => {})
    await miaContext.close().catch(() => {})
    await guestContext.close().catch(() => {})
  }
})

test("removes expired presence after the page is closed", async ({ page }) => {
  process.env.DATABASE_URL = databaseUrl()
  const prisma = new PrismaClient()
  try {
    await login(page, DEMO_USERS.nash.email)
    const id = await createTitledPage(page, "清扫页")
    await page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/pages/${id}/presence` && response.ok())
    await page.route("**/api/pages/*/presence", async (route) => {
      if (route.request().postData()?.includes('"leave"')) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { revision: 1, peers: [] } }) })
        return
      }
      await route.continue()
    })
    await page.goto(`/w/${IDS.product}`)
    await expect(page.getByTestId("sidebar")).toBeVisible()
    const aged = await prisma.pagePresence.updateMany({
      where: { pageId: id },
      data: { seenAt: new Date(Date.now() - 60_000) },
    })
    expect(aged.count).toBeGreaterThan(0)
    const swept = await page.evaluate(async () => {
      const response = await fetch("/api/presence/sweep", { method: "POST" })
      return response.ok
    })
    expect(swept).toBe(true)
    expect(await prisma.pagePresence.count({ where: { pageId: id } })).toBe(0)

    const kept = await page.evaluate(async (pageId) => {
      const response = await fetch(`/api/pages/${pageId}/presence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity: "viewing" }),
      })
      return response.ok
    }, id)
    expect(kept).toBe(true)
    const again = await page.evaluate(async () => {
      const response = await fetch("/api/presence/sweep", { method: "POST" })
      return response.ok
    })
    expect(again).toBe(true)
    expect(await prisma.pagePresence.count({ where: { pageId: id } })).toBe(1)
  } finally {
    await prisma.$disconnect()
  }
})

test("shows members on the share page and hides them from other people", async ({ browser }) => {
  const nashContext = await browser.newContext()
  const miaContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const outsiderContext = await browser.newContext()
  const nash = await nashContext.newPage()
  const mia = await miaContext.newPage()
  const guest = await guestContext.newPage()
  const outsider = await outsiderContext.newPage()
  try {
    await login(nash, DEMO_USERS.nash.email)
    const id = await createTitledPage(nash, "分享在线")
    await setVisibility(nash, "public")
    const editing = nash.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/pages/${id}/presence` && (response.request().postData()?.includes('"editing"') ?? false) && response.ok())
    await nash.getByTestId("page-title").click()
    await editing

    await login(mia, DEMO_USERS.mia.email)
    await mia.goto(`/share/${id}`)
    await expect(mia.getByRole("heading", { name: "分享在线" })).toBeVisible()
    const nashOnShare = mia.locator('[data-testid="presence-peer"][data-user-name="Nash"]')
    await expect(nashOnShare).toBeVisible({ timeout: 15_000 })
    await expect(nashOnShare).toHaveAttribute("data-activity", "editing", { timeout: 12_000 })
    const miaOnNash = nash.locator('[data-testid="presence-peer"][data-user-name="Mia"]')
    await expect(miaOnNash).toBeVisible({ timeout: 15_000 })
    await expect(miaOnNash).toHaveAttribute("data-activity", "viewing")

    await guest.goto(`/share/${id}`)
    await expect(guest.getByRole("heading", { name: "分享在线" })).toBeVisible()
    await expect(guest.getByTestId("presence-peer")).toHaveCount(0)
    await expect(guest.getByTestId("presence-fresh")).toHaveCount(0)

    const stamp = Date.now()
    await outsider.goto("/register")
    await outsider.getByTestId("register-name").fill(`路人${stamp}`)
    await outsider.getByTestId("register-email").fill(`outsider-${stamp}@folio.dev`)
    await outsider.getByTestId("register-password").fill("folio-demo")
    await outsider.getByTestId("register-submit").click()
    await expect(outsider.getByTestId("sidebar")).toBeVisible()
    await outsider.goto(`/share/${id}`)
    await expect(outsider.getByRole("heading", { name: "分享在线" })).toBeVisible()
    await expect(outsider.getByTestId("presence-peer")).toHaveCount(0)
    await expect(outsider.getByTestId("presence-fresh")).toHaveCount(0)

    const saved = patch(nash, id)
    await nash.getByTestId("page-title").fill("分享上的新标题")
    await saved
    await expect(mia.getByTestId("presence-fresh")).toBeVisible({ timeout: 12_000 })
    await mia.getByTestId("presence-refresh").click()
    await expect(mia.getByRole("heading", { name: "分享上的新标题" })).toBeVisible()
  } finally {
    await nashContext.close().catch(() => {})
    await miaContext.close().catch(() => {})
    await guestContext.close().catch(() => {})
    await outsiderContext.close().catch(() => {})
  }
})

test("asks before a refresh drops unsaved edits and applies a clean page without a conflict", async ({ browser }) => {
  const aContext = await browser.newContext()
  const bContext = await browser.newContext()
  const a = await aContext.newPage()
  const b = await bContext.newPage()
  try {
    await login(a, DEMO_USERS.nash.email)
    await login(b, DEMO_USERS.nash.email)
    const id = await createTitledPage(a, "刷新前")
    await b.goto(`/w/${IDS.product}/p/${id}`)
    await expect(b.getByTestId("page-title")).toHaveValue("刷新前")
    await b.route(/\/api\/pages\/[^/]+$/, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "暂停保存" }) })
        return
      }
      await route.continue()
    })
    const remote = patch(a, id)
    await a.getByTestId("page-title").fill("远端标题")
    await remote
    await b.getByTestId("block-input").first().fill("本地草稿")
    await expect(b.getByTestId("save-status")).toContainText("保存失败")
    await expect(b.getByTestId("presence-fresh")).toBeVisible({ timeout: 12_000 })
    await b.getByTestId("presence-refresh").click()
    await expect(b.getByTestId("presence-refresh-confirm")).toBeVisible()
    await expect(b.getByTestId("page-title")).toHaveValue("刷新前")
    await expect(b.getByTestId("block-input").first()).toHaveValue("本地草稿")
    await b.getByTestId("presence-refresh-cancel").click()
    await expect(b.getByTestId("presence-refresh-confirm")).toHaveCount(0)
    await expect(b.getByTestId("block-input").first()).toHaveValue("本地草稿")
    await b.getByTestId("presence-refresh").click()
    await b.getByTestId("presence-refresh-discard").click()
    await expect(b.getByTestId("page-title")).toHaveValue("远端标题")
    await expect(b.getByTestId("block-input").first()).not.toHaveValue("本地草稿")
    await expect(b.getByTestId("conflict-dialog")).toHaveCount(0)
    await b.unroute(/\/api\/pages\/[^/]+$/)
    const saved = patch(b, id)
    await b.getByTestId("page-title").fill("刷新后改的")
    await saved
    await expect(b.getByTestId("conflict-dialog")).toHaveCount(0)
    await expect(b.getByTestId("save-status")).toHaveText("已保存")
  } finally {
    await aContext.close().catch(() => {})
    await bContext.close().catch(() => {})
  }
})

test("warns in the browser before a refresh discards unsaved edits", async ({ page }) => {
  await login(page, DEMO_USERS.nash.email)
  await createTitledPage(page, "离开前提示")
  await page.route(/\/api\/pages\/[^/]+$/, async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "暂停保存" }) })
      return
    }
    await route.continue()
  })
  await page.getByTestId("block-input").first().fill("还没保存")
  await expect(page.getByTestId("save-status")).toContainText("保存失败")
  const leaving = page.waitForEvent("dialog")
  const closed = page.close({ runBeforeUnload: true })
  const dialog = await leaving
  expect(dialog.type()).toBe("beforeunload")
  await dialog.accept()
  await closed
})
