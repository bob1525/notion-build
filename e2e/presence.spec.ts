import { expect, test, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"
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
    await nashContext.close()
    await miaContext.close()
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
    await mia.getByTestId("page-title").click()
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
    await nashContext.close()
    await miaContext.close()
    await guestContext.close()
  }
})
