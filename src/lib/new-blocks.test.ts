import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { BlockView } from "@/components/block-view"
import { createBlock, normalizeBlocks } from "@/lib/blocks"
import { insertChild, setBlockType, splitBlock, updateBlock } from "@/lib/editor-state"

describe("quote block", () => {
  it("creates a quote from existing text", () => {
    const blocks = setBlockType([createBlock({ id: "a", content: "原话" })], "a", "quote")
    expect(blocks[0]).toMatchObject({ type: "quote", content: "原话" })
  })

  it("edits the quote text", () => {
    const next = updateBlock([createBlock({ id: "a", type: "quote", content: "旧" })], "a", { content: "新的引用" })
    expect(next[0].content).toBe("新的引用")
    expect(next[0].type).toBe("quote")
  })

  it("renders the quote with its border", () => {
    const html = renderToStaticMarkup(BlockView({ blocks: [createBlock({ id: "a", type: "quote", content: "被引用" })] }))
    expect(html).toContain("folio-quote")
    expect(html).toContain("被引用")
  })

  it("nests a paragraph inside the quote", () => {
    const quote = createBlock({ id: "q", type: "quote", content: "外层" })
    const blocks = insertChild([quote], "q", createBlock({ id: "c", content: "内层" }))
    expect(blocks.find((block) => block.id === "c")?.parentId).toBe("q")
    const html = renderToStaticMarkup(BlockView({ blocks }))
    expect(html).toContain("quote-children")
    expect(html.indexOf("内层")).toBeGreaterThan(html.indexOf("quote-children"))
  })
})

describe("toggle block", () => {
  it("creates a toggle", () => {
    const blocks = setBlockType([createBlock({ id: "a", content: "更多" })], "a", "toggle")
    expect(blocks[0]).toMatchObject({ type: "toggle", content: "更多", collapsed: false })
  })

  it("edits the toggle title", () => {
    const next = updateBlock([createBlock({ id: "a", type: "toggle", content: "旧标题" })], "a", { content: "新标题" })
    expect(next[0].content).toBe("新标题")
  })

  it("renders nested content only while the toggle is open", () => {
    const open = insertChild([createBlock({ id: "t", type: "toggle", content: "标题" })], "t", createBlock({ id: "c", content: "里面" }))
    expect(renderToStaticMarkup(BlockView({ blocks: open }))).toContain("里面")
    const closed = open.map((block) => (block.id === "t" ? { ...block, collapsed: true } : block))
    const html = renderToStaticMarkup(BlockView({ blocks: closed }))
    expect(html).not.toContain("里面")
    expect(html).toContain("data-collapsed=\"true\"")
  })

  it("remembers nested content and the collapsed flag", () => {
    const blocks = normalizeBlocks([
      { id: "t", type: "toggle", content: "标题", collapsed: true },
      { id: "c", type: "paragraph", content: "里面", parentId: "t" },
    ])
    expect(blocks[0]).toMatchObject({ type: "toggle", collapsed: true })
    expect(blocks[1]).toMatchObject({ parentId: "t", content: "里面" })
    const again = splitBlock(blocks, "t", 2, 2, { createId: () => "n" })
    expect(again.blocks.find((block) => block.id === "n")).toMatchObject({ parentId: "t", type: "paragraph" })
    expect(again.blocks.find((block) => block.id === "t")?.collapsed).toBe(false)
  })
})

describe("divider", () => {
  it("renders the same divider rule every time", () => {
    const blocks = [createBlock({ id: "d", type: "divider", content: "ignored" })]
    const first = renderToStaticMarkup(BlockView({ blocks }))
    const second = renderToStaticMarkup(BlockView({ blocks }))
    expect(first).toBe(second)
    expect(first).toContain("folio-divider")
    expect(first).toContain("data-testid=\"divider-rule\"")
  })
})
