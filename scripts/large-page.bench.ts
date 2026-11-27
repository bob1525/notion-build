import { expect, test, type Page } from "@playwright/test"
import { DEMO_USERS } from "../src/lib/demo-accounts"

const BLOCKS = 320
const DEPTH = 15

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

async function api<T>(page: Page, url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  return page.evaluate(async ({ url, init }) => {
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    })
    const payload = (await response.json()) as { data?: T; error?: string }
    if (!response.ok) throw new Error(payload.error || `请求失败 ${response.status}`)
    return payload.data as T
  }, { url, init })
}

async function waitUntilHydrated(page: Page) {
  await page.waitForFunction(() => {
    const node = document.querySelector("[data-testid='page-screen']")
    if (!node) return false
    return Object.keys(node).some((key) => key.startsWith("__reactFiber") || key.startsWith("__reactContainer"))
  })
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))
  }))
}

test("measures a 320-block page and a 15-level tree", async ({ page }) => {
  await login(page)
  const workspace = await api<{ id: string }>(page, "/api/workspaces", {
    method: "POST",
    body: { name: `大量${Date.now().toString().slice(-6)}`, icon: "📚" },
  })
  const created = await api<{ id: string }>(page, `/api/workspaces/${workspace.id}/pages`, {
    method: "POST",
    body: { title: "三百块" },
  })
  const blocks = Array.from({ length: BLOCKS }, (_, index) => ({
    id: `bench${index}${Math.random().toString(36).slice(2, 10)}`,
    type: "paragraph",
    content: `第${index + 1}段 ${"笔记".repeat(6)}`,
    checked: false,
    language: "",
    marks: [],
    parentId: "",
    collapsed: false,
    src: "",
    width: "",
  }))
  await api(page, `/api/pages/${created.id}`, {
    method: "PATCH",
    body: {
      title: "三百块",
      icon: "📄",
      cover: "",
      visibility: "private",
      pinned: false,
      baseRevision: 0,
      overwrite: false,
      blocks,
    },
  })

  let parentId: string | null = null
  const levelIds: string[] = []
  for (let level = 1; level <= DEPTH; level += 1) {
    const child: { id: string } = await api<{ id: string }>(page, `/api/workspaces/${workspace.id}/pages`, {
      method: "POST",
      body: { title: `第${level}层`, parentId },
    })
    parentId = child.id
    levelIds.push(child.id)
  }
  const deepestId = levelIds[DEPTH - 1]

  const url = `/w/${workspace.id}/p/${created.id}`
  await page.goto(url)
  await page.getByTestId("block").nth(BLOCKS - 1).waitFor({ timeout: 60_000 })
  const reloadStart = Date.now()
  await page.reload()
  await page.getByTestId("block").nth(BLOCKS - 1).waitFor()
  const reloadMs = Date.now() - reloadStart
  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
    return {
      domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
      loadMs: Math.round(entry.loadEventEnd),
      responseMs: Math.round(entry.responseEnd - entry.requestStart),
    }
  })
  await waitUntilHydrated(page)
  const blockCount = await page.getByTestId("block").count()

  await page.evaluate(() => {
    const target = window as Window & { __long?: number[] }
    target.__long = []
    const observer = new PerformanceObserver((list) => {
      target.__long?.push(...list.getEntries().map((entry) => entry.duration))
    })
    observer.observe({ entryTypes: ["longtask"] })
  })
  const inputLatencyMs = await page.evaluate(async () => {
    const input = document.querySelectorAll<HTMLTextAreaElement>("[data-testid='block-input']")[8]
    input.focus()
    const prototype = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
    const tracker = (input as HTMLTextAreaElement & { _valueTracker?: { setValue: (value: string) => void } })._valueTracker
    tracker?.setValue("")
    const next = `${input.value}测`
    const started = performance.now()
    prototype?.set?.call(input, next)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    if (!input.value.endsWith("测")) throw new Error("输入没有留在块里")
    return Math.round(performance.now() - started)
  })
  const inputLongTasks = await page.evaluate(() => {
    const target = window as Window & { __long?: number[] }
    const values = target.__long ?? []
    target.__long = []
    return { count: values.length, maxMs: Math.round(Math.max(0, ...values)) }
  })
  const visibleInput = page.getByTestId("block-input").nth(8)
  const pressStart = Date.now()
  await visibleInput.press("x")
  const pressMs = Date.now() - pressStart

  const from = page.getByTestId("block-drag").nth(2)
  const row = page.getByTestId("block").nth(0)
  const fromBox = await from.boundingBox()
  const rowBox = await row.boundingBox()
  if (!fromBox || !rowBox) throw new Error("大页面没有拖拽布局")
  const dragStart = Date.now()
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rowBox.x + 80, rowBox.y + 6, { steps: 12 })
  await page.mouse.up()
  const dragMs = Date.now() - dragStart
  await expect.poll(async () => page.getByTestId("block-input").first().inputValue()).toContain("第3段")
  const dragLongTasks = await page.evaluate(() => {
    const values = (window as Window & { __long?: number[] }).__long ?? []
    return { count: values.length, maxMs: Math.round(Math.max(0, ...values)) }
  })

  const treeStart = Date.now()
  await page.goto(`/w/${workspace.id}/p/${deepestId}`)
  await expect(page.getByTestId("page-title")).toHaveValue("第15层")
  const childLink = page.locator(`[data-testid='page-link'][data-page-id='${deepestId}']`)
  const parentLink = page.locator(`[data-testid='page-link'][data-page-id='${levelIds[DEPTH - 2]}']`)
  await expect(childLink).toBeVisible()
  const treeLoadMs = Date.now() - treeStart
  const visibleLevels = await page.locator("[data-testid='page-link']").evaluateAll((nodes, ids) => {
    const wanted = new Set(ids as string[])
    return nodes.filter((node) => wanted.has(node.getAttribute("data-page-id") || "")).length
  }, levelIds)

  const parentBefore = await parentLink.getAttribute("data-parent-id")
  const child = page.locator(`[data-testid='page-row'][data-page-id='${deepestId}']`)
  const parent = page.locator(`[data-testid='page-row'][data-page-id='${levelIds[DEPTH - 2]}']`)
  await child.scrollIntoViewIfNeeded()
  const childBox = await child.getByTestId("page-drag").boundingBox()
  const parentBox = await parent.boundingBox()
  if (!childBox || !parentBox) throw new Error("深层页面没有拖拽布局")
  const treeDragStart = Date.now()
  await page.mouse.move(childBox.x + childBox.width / 2, childBox.y + childBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(parentBox.x + Math.min(120, parentBox.width / 2), parentBox.y + 4, { steps: 12 })
  await page.mouse.up()
  const treeDragMs = Date.now() - treeDragStart
  await expect(childLink).toHaveAttribute("data-parent-id", parentBefore ?? "")

  console.log(`BENCH ${JSON.stringify({
    blocks: blockCount,
    reloadMs,
    navigation,
    inputLatencyMs,
    inputLongTasks,
    pressMs,
    dragMs,
    dragLongTasks,
    treeLoadMs,
    visibleLevels,
    treeDragMs,
  })}`)
})
