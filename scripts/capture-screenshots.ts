import { chromium, type Page } from "playwright"
import { mkdir } from "node:fs/promises"
import { DEMO_USERS } from "../src/lib/demo-accounts"
import { IDS, TITLES } from "../src/lib/seed-ids"

const base = "http://127.0.0.1:3000"
const out = "docs/screenshots"

async function login(page: Page, email = DEMO_USERS.nash.email) {
  await page.goto(`${base}/login`)
  await page.getByTestId("login-email").fill(email)
  await page.getByTestId("login-password").fill(DEMO_USERS.nash.password)
  await page.getByTestId("login-submit").click()
  const sidebar = page.getByTestId("sidebar")
  if (!(await sidebar.isVisible().catch(() => false))) {
    await sidebar.waitFor({ state: "visible", timeout: 20_000 }).catch(async () => {
      await page.getByTestId("login-submit").click()
    })
  }
  await sidebar.waitFor({ state: "visible", timeout: 60_000 })
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${out}/${name}.png` })
}

async function main() {
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await login(page)
  await page.goto(`${base}/w/${IDS.product}`)
  await page.getByTestId("workspace-home").waitFor()
  await shot(page, "workspace")

  await page.goto(`${base}/w/${IDS.product}/p/${IDS.welcome}`)
  await page.getByTestId("page-title").waitFor()
  await shot(page, "editor")

  const created = await page.evaluate(async (workspaceId) => {
    const response = await fetch(`/api/workspaces/${workspaceId}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "新块一览" }),
    })
    const payload = (await response.json()) as { data: { id: string } }
    return payload.data.id
  }, IDS.product)
  const quoteId = "shot-quote"
  const toggleId = "shot-toggle"
  await page.evaluate(async ({ id }) => {
    const blocks = [
      { id: "shot-p", type: "paragraph", content: "这是加粗和斜体", checked: false, language: "", marks: [{ type: "bold", start: 2, end: 4 }, { type: "italic", start: 5, end: 7 }], parentId: "", collapsed: false, src: "", width: "" },
      { id: "shot-quote", type: "quote", content: "引用里放一句原话", checked: false, language: "", marks: [], parentId: "", collapsed: false, src: "", width: "" },
      { id: "shot-quote-child", type: "paragraph", content: "引用下面的说明", checked: false, language: "", marks: [], parentId: "shot-quote", collapsed: false, src: "", width: "" },
      { id: "shot-toggle", type: "toggle", content: "折叠起来的记录", checked: false, language: "", marks: [], parentId: "", collapsed: false, src: "", width: "" },
      { id: "shot-toggle-child", type: "paragraph", content: "展开后才看见", checked: false, language: "", marks: [], parentId: "shot-toggle", collapsed: false, src: "", width: "" },
      { id: "shot-code", type: "code", content: "const folio = \"笔记\"", checked: false, language: "javascript", marks: [], parentId: "", collapsed: false, src: "", width: "" },
      { id: "shot-image", type: "image", content: "", checked: false, language: "", marks: [], parentId: "", collapsed: false, src: "/uploads/folio-shot.png", width: "medium" },
    ]
    const response = await fetch(`/api/pages/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "新块一览",
        icon: "🧱",
        cover: "",
        visibility: "private",
        pinned: false,
        baseRevision: 0,
        overwrite: false,
        blocks,
      }),
    })
    if (!response.ok) throw new Error(await response.text())
  }, { id: created, quoteId, toggleId })
  await page.goto(`${base}/w/${IDS.product}/p/${created}`)
  await page.getByTestId("page-title").waitFor()
  await page.getByTestId("block").nth(4).waitFor()
  await shot(page, "blocks")

  await page.getByTestId("search-open").click()
  await page.getByTestId("search-input").fill("wordCount")
  await page.getByTestId("search-highlight").first().waitFor()
  await shot(page, "search")
  await page.keyboard.press("Escape")

  const empty = await page.evaluate(async () => {
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "空白工作区", icon: "📄" }),
    })
    const payload = (await response.json()) as { data: { id: string } }
    return payload.data.id
  })
  await page.goto(`${base}/w/${empty}`)
  await page.getByTestId("empty-state").waitFor()
  await shot(page, "empty")

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${base}/w/${IDS.product}/p/${IDS.welcome}`)
  await page.getByTestId("nav-toggle").click()
  await page.getByTestId("sidebar").waitFor()
  await shot(page, "mobile")
  await page.close()

  const alpha = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const beta = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const a = await alpha.newPage()
  const b = await beta.newPage()
  await login(a)
  await login(b)
  await a.goto(`${base}/w/${IDS.product}`)
  const conflictId = await a.evaluate(async (workspaceId) => {
    const response = await fetch(`/api/workspaces/${workspaceId}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "冲突演示" }),
    })
    const payload = (await response.json()) as { data: { id: string } }
    return payload.data.id
  }, IDS.product)
  const url = `${base}/w/${IDS.product}/p/${conflictId}`
  await a.goto(url)
  await b.goto(url)
  await b.getByTestId("page-title").waitFor()
  const saved = a.waitForResponse((response) => response.url().includes(`/api/pages/${conflictId}`) && response.request().method() === "PATCH" && response.ok())
  await a.getByTestId("page-title").fill("先写的标题")
  await saved
  await b.getByTestId("page-title").fill("后写的标题")
  await b.getByTestId("conflict-dialog").waitFor()
  await b.screenshot({ path: `${out}/conflict.png` })
  await browser.close()
  console.log("screenshots written", TITLES.welcome)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
