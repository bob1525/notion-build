import { expect, test, type Locator, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { formatDateTime, formatZonedDateTime } from "../src/lib/format"
import { IDS } from "../src/lib/seed-ids"

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

async function openHistory(page: Page, id: string) {
  const listed = page.waitForResponse((response) => {
    return response.request().method() === "GET" && new URL(response.url()).pathname === `/api/pages/${id}/history` && response.ok()
  })
  await page.getByTestId("page-history").click()
  await listed
  await expect(page.getByTestId("history-dialog")).toBeVisible()
}

async function replaceBlock(page: Page, text: string) {
  const input = page.getByTestId("block-input").first()
  await input.click()
  await page.keyboard.press("Control+A")
  await page.keyboard.insertText(text)
  await expect(input).toHaveValue(text)
}

async function previewItem(page: Page, id: string, item: Locator, root: "pages" | "share" = "pages") {
  const snapshotId = await item.getAttribute("data-snapshot-id")
  const loaded = page.waitForResponse((response) => {
    return response.request().method() === "GET" && new URL(response.url()).pathname === `/api/${root}/${id}/history/${snapshotId}` && response.ok()
  })
  await item.click()
  await loaded
  return snapshotId
}

async function openShareHistory(page: Page, id: string) {
  const listed = page.waitForResponse((response) => {
    return response.request().method() === "GET" && new URL(response.url()).pathname === `/api/share/${id}/history` && response.ok()
  })
  await page.getByTestId("page-history").click()
  await listed
  await expect(page.getByTestId("history-dialog")).toBeVisible()
}

test("merges continuous edits by the same person into one snapshot", async ({ page }) => {
  await login(page, DEMO_USERS.nash.email)
  const id = await createTitledPage(page, "第一句")
  const saved = patch(page, id)
  await page.getByTestId("page-title").fill("第一句再改")
  await saved
  await expect(page.getByTestId("save-status")).toHaveText("已保存")

  const counted = await page.evaluate(async (pageId) => {
    const [pageResponse, historyResponse] = await Promise.all([
      fetch(`/api/pages/${pageId}`),
      fetch(`/api/pages/${pageId}/history`),
    ])
    const pageBody = (await pageResponse.json()) as { data: { revision: number } }
    const historyBody = (await historyResponse.json()) as { data: unknown[] }
    return { revision: pageBody.data.revision, count: historyBody.data.length }
  }, id)
  expect(counted.revision).toBeGreaterThanOrEqual(2)
  expect(counted.count).toBe(1)

  await openHistory(page, id)
  await expect(page.getByTestId("history-item")).toHaveCount(1)
  await expect(page.getByTestId("history-item")).toHaveAttribute("data-editor", DEMO_USERS.nash.name)
  await previewItem(page, id, page.getByTestId("history-item"))
  await expect(page.getByTestId("history-preview-title")).toContainText("第一句再改")
  await expect(page.getByTestId("history-policy")).toContainText("5 分钟")
})

test("restores an older version as a new snapshot and rejects a stale revision", async ({ browser }) => {
  const nashContext = await browser.newContext()
  const miaContext = await browser.newContext()
  const nash = await nashContext.newPage()
  const mia = await miaContext.newPage()
  try {
    await login(nash, DEMO_USERS.nash.email)
    const id = await createTitledPage(nash, "历史页")
    const wrote = patch(nash, id)
    await nash.getByTestId("block-input").first().fill("旧正文")
    await wrote
    await setVisibility(nash, "public")
    const url = nash.url()

    await login(mia, DEMO_USERS.mia.email)
    await mia.goto(url)
    await expect(mia.getByTestId("block-input").first()).toHaveValue("旧正文")
    const miaSaved = patch(mia, id)
    await replaceBlock(mia, "新正文")
    await miaSaved
    await expect(mia.getByTestId("save-status")).toHaveText("已保存")

    await nash.reload()
    await expect(nash.getByTestId("block-input").first()).toHaveValue("新正文")
    await openHistory(nash, id)
    await expect(nash.getByTestId("history-item")).toHaveCount(2)
    const older = nash.locator(`[data-testid="history-item"][data-editor="${DEMO_USERS.nash.name}"]`)
    await expect(older).toHaveCount(1)
    await previewItem(nash, id, older)
    await expect(nash.getByTestId("history-preview-body")).toContainText("旧正文")
    const restored = nash.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/restore") && response.ok())
    await expect(nash.getByTestId("history-restore")).toBeEnabled()
    await nash.getByTestId("history-restore").click()
    await restored
    await expect(nash.getByTestId("history-dialog")).toBeHidden()
    await expect(nash.getByTestId("block-input").first()).toHaveValue("旧正文")

    await openHistory(nash, id)
    await expect(nash.getByTestId("history-item")).toHaveCount(3)
    const miaItem = nash.locator(`[data-testid="history-item"][data-editor="${DEMO_USERS.mia.name}"]`)
    await previewItem(nash, id, miaItem)
    await expect(nash.getByTestId("history-preview-body")).toContainText("新正文")
    const restoredAgain = nash.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/restore") && response.ok())
    await nash.getByTestId("history-restore").click()
    await restoredAgain
    await expect(nash.getByTestId("block-input").first()).toHaveValue("新正文")

    await openHistory(nash, id)
    await expect(nash.getByTestId("history-item")).toHaveCount(4)
    await expect(nash.getByTestId("history-item").first()).toHaveAttribute("data-editor", DEMO_USERS.nash.name)
    const snapshotId = await nash.getByTestId("history-item").first().getAttribute("data-snapshot-id")
    const conflict = await nash.evaluate(async ({ pageId, snapshot }) => {
      const response = await fetch(`/api/pages/${pageId}/history/${snapshot}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision: 0, overwrite: false }),
      })
      return response.status
    }, { pageId: id, snapshot: snapshotId })
    expect(conflict).toBe(409)

    await nash.reload()
    await expect(nash.getByTestId("block-input").first()).toHaveValue("新正文")
    await expect(nash.getByTestId("page-title")).toHaveValue("历史页")
  } finally {
    await nashContext.close()
    await miaContext.close()
  }
})

test("lets a read-only member view history and refuses the restore", async ({ browser }) => {
  const nashContext = await browser.newContext()
  const miaContext = await browser.newContext()
  const nash = await nashContext.newPage()
  const mia = await miaContext.newPage()
  try {
    await login(nash, DEMO_USERS.nash.email)
    await login(mia, DEMO_USERS.mia.email)
    const id = await createTitledPage(nash, "只读历史")
    const wrote = patch(nash, id)
    await nash.getByTestId("block-input").first().fill("只有作者能恢复")
    await wrote
    const hidden = await mia.evaluate(async (pageId) => {
      const response = await fetch(`/api/pages/${pageId}/history`)
      return response.status
    }, id)
    expect(hidden).toBe(403)

    await setVisibility(nash, "read")
    await mia.goto(nash.url())
    await expect(mia.getByTestId("page-readonly")).toBeVisible()
    await expect(mia.getByTestId("page-title")).toHaveValue("只读历史")
    await openHistory(mia, id)
    await expect(mia.getByTestId("history-item")).toHaveCount(1)
    await expect(mia.getByTestId("history-item")).toHaveAttribute("data-editor", DEMO_USERS.nash.name)
    await previewItem(mia, id, mia.getByTestId("history-item"))
    await expect(mia.getByTestId("history-preview-body")).toContainText("只有作者能恢复")
    await expect(mia.getByTestId("history-restore")).toHaveCount(0)
    await expect(mia.getByTestId("history-readonly")).toBeVisible()
    const snapshotId = await mia.getByTestId("history-item").getAttribute("data-snapshot-id")
    const denied = await mia.evaluate(async ({ pageId, snapshot }) => {
      const loaded = await fetch(`/api/pages/${pageId}`)
      const revision = ((await loaded.json()) as { data: { revision: number } }).data.revision
      const response = await fetch(`/api/pages/${pageId}/history/${snapshot}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision: revision, overwrite: false }),
      })
      return response.status
    }, { pageId: id, snapshot: snapshotId })
    expect(denied).toBe(403)

    await openHistory(nash, id)
    await previewItem(nash, id, nash.getByTestId("history-item"))
    await expect(nash.getByTestId("history-restore")).toBeEnabled()
    await mia.reload()
    await expect(mia.getByTestId("page-title")).toHaveValue("只读历史")
    await expect(mia.getByTestId("block-input")).toHaveCount(0)
  } finally {
    await nashContext.close()
    await miaContext.close()
  }
})

test("shows snapshot times in the viewer's timezone", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "Asia/Shanghai" })
  const page = await context.newPage()
  try {
    await login(page, DEMO_USERS.nash.email)
    const id = await createTitledPage(page, "本地时间")
    await openHistory(page, id)
    const item = page.getByTestId("history-item")
    const iso = await item.getAttribute("data-updated-at")
    expect(iso).toBeTruthy()
    const shown = (await item.locator("span").first().innerText()).trim()
    expect(shown).toBe(formatZonedDateTime(iso ?? "", "Asia/Shanghai"))
    expect(shown).toContain("UTC+08:00")
    expect(shown).not.toBe(formatDateTime(iso ?? ""))
    await previewItem(page, id, item)
    await expect(page.getByTestId("history-preview")).toContainText(shown)
  } finally {
    await context.close()
  }
})

test("shows history on a public share link and keeps restore behind edit access", async ({ browser }) => {
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
    await login(mia, DEMO_USERS.mia.email)
    const id = await createTitledPage(nash, "分享历史")
    const wrote = patch(nash, id)
    await nash.getByTestId("block-input").first().fill("只能看历史")
    await wrote
    await setVisibility(nash, "read")

    await guest.goto(`/share/${id}`)
    await expect(guest.getByRole("heading", { name: "分享历史" })).toBeVisible()
    await openShareHistory(guest, id)
    await expect(guest.getByTestId("history-item")).toHaveCount(1)
    await expect(guest.getByTestId("history-item")).toHaveAttribute("data-editor", DEMO_USERS.nash.name)
    await previewItem(guest, id, guest.getByTestId("history-item"), "share")
    await expect(guest.getByTestId("history-preview-body")).toContainText("只能看历史")
    await expect(guest.getByTestId("history-restore")).toHaveCount(0)
    await expect(guest.getByTestId("history-readonly")).toBeVisible()
    const guestSnapshot = await guest.getByTestId("history-item").getAttribute("data-snapshot-id")
    const guestStatus = await guest.evaluate(async ({ pageId, snapshot }) => {
      const listed = await fetch(`/api/share/${pageId}/history`)
      const member = await fetch(`/api/pages/${pageId}/history`)
      const restored = await fetch(`/api/pages/${pageId}/history/${snapshot}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision: 1, overwrite: false }),
      })
      const body = (await listed.json()) as { data: unknown[] }
      return { share: listed.status, count: body.data.length, member: member.status, restore: restored.status }
    }, { pageId: id, snapshot: guestSnapshot })
    expect(guestStatus.share).toBe(200)
    expect(guestStatus.count).toBe(1)
    expect(guestStatus.member).toBe(401)
    expect(guestStatus.restore).toBe(401)

    const stamp = Date.now()
    await outsider.goto("/register")
    await outsider.getByTestId("register-name").fill("外人")
    await outsider.getByTestId("register-email").fill(`outsider-history-${stamp}@folio.dev`)
    await outsider.getByTestId("register-password").fill(DEMO_USERS.nash.password)
    await outsider.getByTestId("register-submit").click()
    await expect(outsider.getByTestId("sidebar")).toBeVisible({ timeout: 60_000 })
    await outsider.goto(`/share/${id}`)
    await openShareHistory(outsider, id)
    await expect(outsider.getByTestId("history-restore")).toHaveCount(0)
    await expect(outsider.getByTestId("history-readonly")).toBeVisible()
    const outsiderDenied = await outsider.evaluate(async ({ pageId, snapshot }) => {
      const response = await fetch(`/api/pages/${pageId}/history/${snapshot}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision: 1, overwrite: false }),
      })
      return response.status
    }, { pageId: id, snapshot: guestSnapshot })
    expect(outsiderDenied).toBe(404)

    await mia.goto(`/share/${id}`)
    await openShareHistory(mia, id)
    await previewItem(mia, id, mia.getByTestId("history-item"), "share")
    await expect(mia.getByTestId("history-preview-body")).toContainText("只能看历史")
    await expect(mia.getByTestId("history-restore")).toHaveCount(0)
    await expect(mia.getByTestId("history-readonly")).toBeVisible()
    const miaDenied = await mia.evaluate(async ({ pageId, snapshot }) => {
      const loaded = await fetch(`/api/pages/${pageId}`)
      const revision = ((await loaded.json()) as { data: { revision: number } }).data.revision
      const response = await fetch(`/api/pages/${pageId}/history/${snapshot}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision: revision, overwrite: false }),
      })
      return response.status
    }, { pageId: id, snapshot: guestSnapshot })
    expect(miaDenied).toBe(403)

    await nash.goto(`/share/${id}`)
    await openShareHistory(nash, id)
    await previewItem(nash, id, nash.getByTestId("history-item"), "share")
    await expect(nash.getByTestId("history-restore")).toBeEnabled()
    const stale = await nash.evaluate(async ({ pageId, snapshot }) => {
      const response = await fetch(`/api/pages/${pageId}/history/${snapshot}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision: 0, overwrite: false }),
      })
      return response.status
    }, { pageId: id, snapshot: guestSnapshot })
    expect(stale).toBe(409)
    const restored = nash.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/restore") && response.ok())
    await nash.getByTestId("history-restore").click()
    await restored
    await expect(nash.getByTestId("history-dialog")).toBeHidden()
    await expect(nash.getByRole("heading", { name: "分享历史" })).toBeVisible()
    await expect(nash.getByText("只能看历史")).toBeVisible()

    await nash.goto(`/w/${IDS.product}/p/${id}`)
    await setVisibility(nash, "private")
    await guest.goto(`/share/${id}`)
    await expect(guest.getByTestId("share-missing")).toBeVisible()
    await expect(guest.getByTestId("page-history")).toHaveCount(0)
    const hidden = await guest.evaluate(async (pageId) => {
      const response = await fetch(`/api/share/${pageId}/history`)
      return response.status
    }, id)
    expect(hidden).toBe(404)
    const memberHidden = await mia.evaluate(async (pageId) => {
      const response = await fetch(`/api/pages/${pageId}/history`)
      return response.status
    }, id)
    expect(memberHidden).toBe(403)
  } finally {
    await nashContext.close()
    await miaContext.close()
    await guestContext.close()
    await outsiderContext.close()
  }
})
