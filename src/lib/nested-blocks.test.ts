import { describe, expect, it } from "vitest"
import { normalizeBlocks } from "@/lib/blocks"
import { createBlock } from "@/lib/blocks"
import { insertPastedBlocks } from "@/lib/clipboard"
import {
  BLOCK_MOVE_DESCENDANT,
  BLOCK_MOVE_DEPTH,
  indentBlock,
  moveBlock,
  moveNestedBlock,
  nestUnderPrevious,
  reorderBlocks,
  unnestBlock,
} from "@/lib/editor-state"
import { blocksToMarkdown, markdownToBlocks } from "@/lib/markdown"
import { blocksFromMarkdown } from "@/components/markdown-pane"
import type { BlockDTO } from "@/lib/types"

function text(id: string, content: string, parentId = "", type: BlockDTO["type"] = "paragraph"): BlockDTO {
  return createBlock({ id, type, content, parentId })
}

describe("nested blocks", () => {
  it("indents under the previous sibling and keeps children and marks", () => {
    const child = text("b", "看文档")
    child.marks = [{ type: "bold", start: 0, end: 1 }, { type: "link", start: 1, end: 3, href: "https://example.com/docs" }]
    const grandchild = text("c", "更深", "b")
    const indented = nestUnderPrevious([text("a", "父"), child, grandchild], "b")
    expect(indented.find((block) => block.id === "b")).toMatchObject({
      parentId: "a",
      content: "看文档",
      marks: child.marks,
    })
    expect(indented.find((block) => block.id === "c")?.parentId).toBe("b")
    expect(indented.map((block) => block.id)).toEqual(["a", "b", "c"])
    expect(nestUnderPrevious([text("a", "只有一块")], "a")).toHaveLength(1)
  })

  it("outdents a block and adopts the siblings that followed it", () => {
    const blocks = [text("a", "父"), text("b", "当前", "a"), text("c", "后面", "a"), text("d", "孙", "c")]
    const lifted = unnestBlock(blocks, "b")
    expect(lifted.map((block) => block.id)).toEqual(["a", "b", "c", "d"])
    expect(lifted.find((block) => block.id === "b")?.parentId).toBe("")
    expect(lifted.find((block) => block.id === "c")?.parentId).toBe("b")
    expect(lifted.find((block) => block.id === "d")?.parentId).toBe("c")
    expect(unnestBlock(lifted, "b")).toBe(lifted)
  })

  it("moves a subtree inside another block or onto another level", () => {
    const blocks = [text("a", "甲"), text("b", "乙"), text("c", "丙", "b"), text("d", "丁")]
    const inside = moveNestedBlock(blocks, "b", "a", "inside")
    expect(inside.ok).toBe(true)
    if (!inside.ok) return
    expect(inside.blocks.find((block) => block.id === "b")?.parentId).toBe("a")
    expect(inside.blocks.find((block) => block.id === "c")?.parentId).toBe("b")
    expect(inside.blocks.map((block) => block.id)).toEqual(["a", "b", "c", "d"])

    const before = moveNestedBlock(inside.blocks, "b", "d", "before")
    expect(before.ok).toBe(true)
    if (!before.ok) return
    expect(before.blocks.map((block) => [block.id, block.parentId])).toEqual([
      ["a", ""],
      ["b", ""],
      ["c", "b"],
      ["d", ""],
    ])

    const toggle = text("t", "折叠", "", "toggle")
    toggle.collapsed = true
    const opened = moveNestedBlock([toggle, text("n", "新")], "n", "t", "inside")
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.blocks[0]).toMatchObject({ id: "t", collapsed: false })
    expect(moveBlock(before.blocks, "b", 1).map((block) => block.id)).toEqual(["a", "d", "b", "c"])
  })

  it("refuses to drop a block into itself or its descendant", () => {
    const blocks = [text("a", "甲"), text("b", "乙", "a"), text("c", "丙", "b")]
    const intoChild = moveNestedBlock(blocks, "a", "c", "inside")
    expect(intoChild).toEqual({ ok: false, message: BLOCK_MOVE_DESCENDANT })
    const besideChild = moveNestedBlock(blocks, "a", "b", "after")
    expect(besideChild).toEqual({ ok: false, message: BLOCK_MOVE_DESCENDANT })
    expect(reorderBlocks(blocks, "a", "c", "before")).toBe(blocks)
    expect(reorderBlocks(blocks, "a", "a", "after")).toBe(blocks)
  })

  it("stops indenting at eight levels", () => {
    let blocks = [text("0", "0")]
    for (let depth = 1; depth <= 7; depth += 1) {
      const leaf = blocks[blocks.length - 1]
      blocks = nestUnderPrevious([...blocks, text(String(depth), String(depth), leaf.parentId)], String(depth))
      expect(blocks.find((block) => block.id === String(depth))?.parentId).toBe(leaf.id)
    }
    const leaf = blocks[blocks.length - 1]
    const stuck = indentBlock([...blocks, text("8", "8", leaf.parentId)], "8")
    expect(stuck).toMatchObject({ ok: false, message: BLOCK_MOVE_DEPTH })
  })

  it("keeps nested parents and marks through the save normalizer, and clears a cycle", () => {
    const saved = normalizeBlocks([
      { id: "a", type: "paragraph", content: "父", marks: [{ type: "bold", start: 0, end: 1 }] },
      { id: "b", type: "paragraph", content: "子", parentId: "a", marks: [{ type: "link", start: 0, end: 1, href: "https://example.com/docs" }] },
      { id: "c", type: "todo", content: "待办", parentId: "b", checked: true },
    ])
    expect(saved.map((block) => [block.id, block.parentId])).toEqual([
      ["a", ""],
      ["b", "a"],
      ["c", "b"],
    ])
    expect(saved[0]?.marks).toEqual([{ type: "bold", start: 0, end: 1 }])
    expect(saved[1]?.marks).toEqual([{ type: "link", start: 0, end: 1, href: "https://example.com/docs" }])
    expect(saved[2]).toMatchObject({ type: "todo", checked: true, content: "待办" })

    const cycled = normalizeBlocks([
      { id: "a", type: "paragraph", content: "甲", parentId: "b" },
      { id: "b", type: "paragraph", content: "乙", parentId: "a" },
    ])
    expect(cycled.map((block) => block.content)).toEqual(["甲", "乙"])
    expect(cycled.every((block) => block.parentId === "")).toBe(true)
  })

  it("round-trips nested markdown and keeps ids when the draft is parsed again", () => {
    const parent = text("p", "父")
    const child = text("c", "子文档", "p")
    child.marks = [{ type: "bold", start: 0, end: 1 }]
    const grandchild = text("g", "孙", "c", "bulleted")
    const quote = text("q", "外层", "", "quote")
    const quoted = text("qc", "内层", "q")
    const markdown = blocksToMarkdown([parent, child, grandchild, quote, quoted])
    expect(markdown).toContain(":::child")
    expect(markdown).toContain("**子**文档")
    const parsed = markdownToBlocks(markdown)
    expect(parsed.map((block) => block.content)).toEqual(["父", "子文档", "孙", "外层", "内层"])
    expect(parsed[1]?.parentId).toBe(parsed[0]?.id)
    expect(parsed[2]?.parentId).toBe(parsed[1]?.id)
    expect(parsed[2]?.type).toBe("bulleted")
    expect(parsed[1]?.marks).toEqual([{ type: "bold", start: 0, end: 1 }])
    expect(parsed[3]?.type).toBe("quote")
    expect(parsed[4]?.parentId).toBe(parsed[3]?.id)

    const restored = blocksFromMarkdown(markdown, [parent, child, grandchild, quote, quoted])
    expect(restored.map((block) => block.id)).toEqual(["p", "c", "g", "q", "qc"])
    expect(restored.find((block) => block.id === "c")?.parentId).toBe("p")
    expect(restored.find((block) => block.id === "g")?.parentId).toBe("c")
    expect(restored.find((block) => block.id === "qc")?.parentId).toBe("q")
  })

  it("pastes a nested range with an empty block and stays at the target level", () => {
    let next = 0
    const parent = text("p", "父")
    parent.marks = [{ type: "bold", start: 0, end: 1 }]
    const child = text("c", "", "p")
    const replaced = insertPastedBlocks([text("empty", "")], "empty", [parent, child], () => `n${next++}`)
    expect(replaced.blocks.map((block) => block.content)).toEqual(["父", ""])
    expect(replaced.blocks[1]?.parentId).toBe(replaced.blocks[0]?.id)
    expect(replaced.blocks[0]?.marks).toEqual([{ type: "bold", start: 0, end: 1 }])

    next = 0
    const outer = text("outer", "外")
    const target = text("t", "已有", "outer")
    const appended = insertPastedBlocks([outer, target], "t", [text("a", "贴"), text("b", "内", "a")], () => `p${next++}`)
    expect(appended.blocks.find((block) => block.content === "贴")).toMatchObject({ parentId: "outer" })
    const pastedParent = appended.blocks.find((block) => block.content === "贴")
    expect(appended.blocks.find((block) => block.content === "内")?.parentId).toBe(pastedParent?.id)
    expect(appended.blocks.find((block) => block.id === "t")?.content).toBe("已有")
  })
})
