import { expect, test, type Locator, type Page } from "@playwright/test"
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

async function createPage(page: Page, title: string) {
  await page.goto(`/w/${IDS.product}`)
  await page.getByTestId("new-page").click()
  await expect(page.getByTestId("page-title")).toHaveValue("")
  await page.waitForURL(/\/p\/[^/]+$/)
  const id = new URL(page.url()).pathname.split("/").pop()
  const saved = page.waitForResponse((response) => response.url().includes(`/api/pages/${id}`) && response.request().method() === "PATCH" && response.ok())
  await page.getByTestId("page-title").fill(title)
  await saved
}

function patchSaved(page: Page) {
  return page.waitForResponse((response) => response.url().includes("/api/pages/") && response.request().method() === "PATCH" && response.ok())
}

async function blockValues(page: Page) {
  return page.getByTestId("block-input").evaluateAll((nodes) => nodes.map((node) => (node as HTMLTextAreaElement).value))
}

async function seedLines(page: Page, lines: string[]) {
  const first = page.getByTestId("block-input").first()
  await first.click()
  let saved = patchSaved(page)
  await first.fill(lines[0])
  await saved
  for (let index = 1; index < lines.length; index += 1) {
    await page.getByTestId("block-input").nth(index - 1).press("Enter")
    const next = page.getByTestId("block-input").nth(index)
    await expect(next).toBeVisible()
    saved = patchSaved(page)
    await next.fill(lines[index])
    await saved
  }
}

async function dragBlock(page: Page, from: number, to: number, edge: "before" | "after") {
  const handle = page.getByTestId("block-drag").nth(from)
  const row = page.getByTestId("block").nth(to)
  const handleBox = await handle.boundingBox()
  const rowBox = await row.boundingBox()
  if (!handleBox || !rowBox) throw new Error("拖拽手柄或目标块没有布局")
  const saved = patchSaved(page)
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  const y = edge === "before" ? rowBox.y + 8 : rowBox.y + rowBox.height - 8
  await page.mouse.move(rowBox.x + Math.min(120, rowBox.width / 2), y, { steps: 18 })
  await expect(page.getByTestId("drop-indicator")).toBeVisible()
  await page.mouse.up()
  await saved
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test("drags a block to the first position and keeps the order after reload", async ({ page }) => {
  await createPage(page, `拖到首位${Date.now()}`)
  await seedLines(page, ["甲", "乙", "丙"])
  await dragBlock(page, 2, 0, "before")
  await expect.poll(() => blockValues(page)).toEqual(["丙", "甲", "乙"])
  await page.reload()
  await expect.poll(() => blockValues(page)).toEqual(["丙", "甲", "乙"])
})

test("drags a block to the last position and keeps the order after reload", async ({ page }) => {
  await createPage(page, `拖到末位${Date.now()}`)
  await seedLines(page, ["甲", "乙", "丙"])
  await dragBlock(page, 0, 2, "after")
  await expect.poll(() => blockValues(page)).toEqual(["乙", "丙", "甲"])
  await page.reload()
  await expect.poll(() => blockValues(page)).toEqual(["乙", "丙", "甲"])
})

test("drags a block into the middle of its siblings", async ({ page }) => {
  await createPage(page, `拖到中间${Date.now()}`)
  await seedLines(page, ["甲", "乙", "丙"])
  await dragBlock(page, 2, 1, "before")
  await expect.poll(() => blockValues(page)).toEqual(["甲", "丙", "乙"])
  await page.reload()
  await expect.poll(() => blockValues(page)).toEqual(["甲", "丙", "乙"])
})

test("handles two drags in a row without losing the final order", async ({ page }) => {
  await createPage(page, `连续拖拽${Date.now()}`)
  await seedLines(page, ["甲", "乙", "丙"])
  await dragBlock(page, 2, 0, "before")
  await expect.poll(() => blockValues(page)).toEqual(["丙", "甲", "乙"])
  await dragBlock(page, 2, 0, "before")
  await expect.poll(() => blockValues(page)).toEqual(["乙", "丙", "甲"])
  await page.reload()
  await expect.poll(() => blockValues(page)).toEqual(["乙", "丙", "甲"])
})

test("shows an insertion line while dragging and hides it after release", async ({ page }) => {
  await createPage(page, `插入线${Date.now()}`)
  await seedLines(page, ["甲", "乙", "丙"])
  const handle = page.getByTestId("block-drag").nth(2)
  const row = page.getByTestId("block").nth(0)
  const handleBox = await handle.boundingBox()
  const rowBox = await row.boundingBox()
  if (!handleBox || !rowBox) throw new Error("拖拽手柄或目标块没有布局")
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rowBox.x + 80, rowBox.y + 8, { steps: 18 })
  await expect(page.getByTestId("drop-indicator")).toBeVisible()
  await expect(page.getByTestId("drop-indicator")).toHaveCount(1)
  const saved = patchSaved(page)
  await page.mouse.up()
  await saved
  await expect(page.getByTestId("drop-indicator")).toHaveCount(0)
  await expect.poll(() => blockValues(page)).toEqual(["丙", "甲", "乙"])
})

test("drags the middle block above the first and below the last in succession", async ({ page }) => {
  await createPage(page, `中段往返${Date.now()}`)
  await seedLines(page, ["甲", "乙", "丙", "丁"])
  await dragBlock(page, 1, 0, "before")
  await expect.poll(() => blockValues(page)).toEqual(["乙", "甲", "丙", "丁"])
  await dragBlock(page, 0, 3, "after")
  await expect.poll(() => blockValues(page)).toEqual(["甲", "丙", "丁", "乙"])
  await page.reload()
  await expect.poll(() => blockValues(page)).toEqual(["甲", "丙", "丁", "乙"])
})

test("creates a sibling of the same type when Enter is pressed in an empty paragraph", async ({ page }) => {
  await createPage(page, `空段落回车${Date.now()}`)
  await page.getByTestId("block-input").first().press("Enter")
  await expect(page.getByTestId("block")).toHaveCount(2)
  await expect(page.getByTestId("block").nth(0)).toHaveAttribute("data-block-type", "paragraph")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-block-type", "paragraph")
  await page.getByTestId("block-input").nth(1).pressSequentially("下一块")
  await expect(page.getByTestId("block-input").nth(1)).toHaveValue("下一块")
})

test("creates another heading when Enter is pressed in an empty heading", async ({ page }) => {
  await createPage(page, `空标题回车${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  await input.pressSequentially("#")
  await input.press(" ")
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "heading1")
  await input.press("Enter")
  await expect(page.getByTestId("block")).toHaveCount(2)
  await expect(page.getByTestId("block").nth(0)).toHaveAttribute("data-block-type", "heading1")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-block-type", "heading1")
  await page.getByTestId("block-input").nth(1).pressSequentially("下一标题")
  await expect(page.getByTestId("block-input").nth(1)).toHaveValue("下一标题")
})

test("removes an empty block with Backspace and puts the caret at the end of the previous block", async ({ page }) => {
  await createPage(page, `空块退格${Date.now()}`)
  const first = page.getByTestId("block-input").first()
  await first.fill("甲乙")
  await first.press("Enter")
  await expect(page.getByTestId("block")).toHaveCount(2)
  await page.getByTestId("block-input").nth(1).press("Backspace")
  await expect(page.getByTestId("block")).toHaveCount(1)
  await page.keyboard.type("丙")
  await expect(page.getByTestId("block-input").first()).toHaveValue("甲乙丙")
})

test("merges a block into the previous one when Backspace is pressed at the start", async ({ page }) => {
  await createPage(page, `块首合并${Date.now()}`)
  const first = page.getByTestId("block-input").first()
  await first.fill("甲乙")
  await first.press("Enter")
  const second = page.getByTestId("block-input").nth(1)
  await second.fill("丙丁")
  await second.press("Home")
  await second.press("Backspace")
  await expect(page.getByTestId("block")).toHaveCount(1)
  await expect(page.getByTestId("block-input").first()).toHaveValue("甲乙丙丁")
  await page.keyboard.type("X")
  await expect(page.getByTestId("block-input").first()).toHaveValue("甲乙X丙丁")
})

test("creates another code block when Enter is pressed in an empty code block", async ({ page }) => {
  await createPage(page, `空代码回车${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  await input.pressSequentially("```")
  await expect(page.getByTestId("block").first()).toHaveAttribute("data-block-type", "code")
  await input.press("Enter")
  await expect(page.getByTestId("block")).toHaveCount(2)
  await expect(page.getByTestId("block").nth(0)).toHaveAttribute("data-block-type", "code")
  await expect(page.getByTestId("block").nth(1)).toHaveAttribute("data-block-type", "code")
  await page.getByTestId("block-input").nth(1).pressSequentially("next")
  await expect(page.getByTestId("block-input").nth(1)).toHaveValue("next")
})

async function selectText(input: Locator, start: number, end: number) {
  await input.evaluate((element, range) => {
    const field = element as HTMLTextAreaElement
    field.focus()
    field.setSelectionRange(range.start, range.end)
    field.dispatchEvent(new Event("select", { bubbles: true }))
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }))
  }, { start, end })
}

test("saves bold, italic, strike, and inline code, then reloads them", async ({ page }) => {
  await createPage(page, `富文本${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  let saved = patchSaved(page)
  await input.fill("你好世界")
  await saved
  await input.click()
  await page.keyboard.press("End")
  await page.keyboard.down("Shift")
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.up("Shift")
  saved = patchSaved(page)
  await page.keyboard.press("Control+b")
  await saved
  await expect(page.locator('[data-inline-marks~="bold"]')).toHaveText("世界")
  await expect(input).toHaveValue("你好世界")
  await input.press("End")

  await input.press("Enter")
  const italic = page.getByTestId("block-input").nth(1)
  await italic.fill("/斜体")
  await expect(page.getByTestId("slash-format-italic")).toBeVisible()
  await page.getByTestId("slash-format-italic").click()
  saved = patchSaved(page)
  await italic.pressSequentially("强调")
  await saved
  await expect(page.locator('[data-inline-marks~="italic"]')).toHaveText("强调")

  await italic.press("Enter")
  const strike = page.getByTestId("block-input").nth(2)
  saved = patchSaved(page)
  await strike.fill("删掉这句")
  await saved
  await selectText(strike, 0, 2)
  await expect(page.getByTestId("format-toolbar")).toBeVisible()
  saved = patchSaved(page)
  await page.getByTestId("format-strike").click()
  await saved
  await expect(page.locator('[data-inline-marks~="strike"]')).toHaveText("删掉")

  await strike.press("End")
  await strike.press("Enter")
  const code = page.getByTestId("block-input").nth(3)
  saved = patchSaved(page)
  await code.pressSequentially("前`code`后")
  await saved
  await expect(code).toHaveValue("前code后")
  await expect(page.locator('[data-inline-marks~="code"]')).toHaveText("code")
  await expect(page.getByTestId("save-status")).toHaveText("已保存")

  await page.reload()
  await expect(page.getByTestId("block-input").nth(0)).toHaveValue("你好世界")
  await expect(page.locator('[data-inline-marks~="bold"]')).toHaveText("世界")
  await expect(page.locator('[data-inline-marks~="italic"]')).toHaveText("强调")
  await expect(page.locator('[data-inline-marks~="strike"]')).toHaveText("删掉")
  await expect(page.locator('[data-inline-marks~="code"]')).toHaveText("code")

  const again = page.getByTestId("block-input").first()
  await again.click()
  await page.keyboard.press("End")
  await page.keyboard.down("Shift")
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.up("Shift")
  saved = patchSaved(page)
  await page.keyboard.press("Control+b")
  await saved
  await expect(page.locator('[data-inline-marks~="bold"]')).toHaveCount(0)
  await expect(page.getByTestId("save-status")).toHaveText("已保存")
  await page.reload()
  await expect(page.locator('[data-inline-marks~="bold"]')).toHaveCount(0)
  await expect(page.getByTestId("block-input").first()).toHaveValue("你好世界")
})

test("keeps the caret aligned with italic text", async ({ page }) => {
  await createPage(page, `斜体对齐${Date.now()}`)
  const input = page.getByTestId("block-input").first()
  const saved = patchSaved(page)
  await input.fill("甲乙丙丁")
  await saved
  await input.click()
  await page.keyboard.press("Home")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.down("Shift")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.up("Shift")
  const marked = patchSaved(page)
  await page.keyboard.press("Control+i")
  await marked
  await expect(page.locator('[data-inline-marks~="italic"]')).toHaveText("乙丙")
  const metrics = await page.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>("[data-testid='block-input']")
    const italic = document.querySelector<HTMLElement>('[data-inline-marks~="italic"]')
    if (!textarea || !italic) return null
    const style = getComputedStyle(textarea)
    const probe = document.createElement("span")
    probe.style.position = "absolute"
    probe.style.visibility = "hidden"
    probe.style.whiteSpace = "pre"
    probe.style.font = style.font
    probe.style.fontStyle = "normal"
    probe.textContent = "乙丙"
    document.body.appendChild(probe)
    const probeWidth = probe.offsetWidth
    probe.remove()
    const computed = getComputedStyle(italic)
    return {
      fontStyle: computed.fontStyle,
      transform: computed.transform,
      probeWidth,
      spanWidth: italic.offsetWidth,
    }
  })
  expect(metrics).not.toBeNull()
  expect(metrics?.fontStyle).toBe("normal")
  expect(metrics?.transform).not.toBe("none")
  expect(Math.abs((metrics?.probeWidth ?? 0) - (metrics?.spanWidth ?? 0))).toBeLessThanOrEqual(1)
})
