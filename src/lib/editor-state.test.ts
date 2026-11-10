import { describe, expect, it } from "vitest"
import { createBlock } from "@/lib/blocks"
import { backspaceAtStart, moveBlock, removeBlock, setBlockType, splitBlock } from "@/lib/editor-state"
import type { BlockDTO } from "@/lib/types"

function paragraph(id: string, content: string, type: BlockDTO["type"] = "paragraph"): BlockDTO {
  return createBlock({ id, type, content, position: 0 })
}

describe("editor state", () => {
  it("splits a paragraph at the caret and continues a list", () => {
    const blocks = [paragraph("a", "你好世界")]
    const split = splitBlock(blocks, "a", 2, 2, { createId: () => "b" })
    expect(split.blocks.map((block) => block.content)).toEqual(["你好", "世界"])
    expect(split.focusId).toBe("b")

    const list = [paragraph("a", "第一", "bulleted")]
    const next = splitBlock(list, "a", 2, 2, { createId: () => "b" })
    expect(next.blocks.map((block) => block.type)).toEqual(["bulleted", "bulleted"])
  })

  it("turns an empty list item back into a paragraph", () => {
    const blocks = [paragraph("a", "", "todo")]
    const result = splitBlock(blocks, "a", 0, 0)
    expect(result.blocks[0].type).toBe("paragraph")
    expect(result.focusId).toBe("a")
  })

  it("merges into the previous block, and steps a heading back to text first", () => {
    const heading = backspaceAtStart([paragraph("a", "标题", "heading1")], "a")
    expect(heading?.blocks[0].type).toBe("paragraph")

    const merged = backspaceAtStart(
      [paragraph("a", "前"), paragraph("b", "后")],
      "b",
    )
    expect(merged?.blocks).toHaveLength(1)
    expect(merged?.blocks[0].content).toBe("前后")
    expect(merged?.caret).toBe(1)
  })

  it("keeps a single empty paragraph when the last block is removed", () => {
    const result = removeBlock([paragraph("a", "只剩我")], "a")
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toMatchObject({ id: "a", type: "paragraph", content: "" })
  })

  it("moves a block up and changes its type without dropping text", () => {
    const blocks = [paragraph("a", "一"), paragraph("b", "二")]
    expect(moveBlock(blocks, "b", -1).map((block) => block.id)).toEqual(["b", "a"])
    expect(moveBlock(blocks, "a", -1)).toBe(blocks)
    const typed = setBlockType(blocks, "a", "code", { content: "const n = 1" })
    expect(typed[0]).toMatchObject({ type: "code", content: "const n = 1" })
    expect(setBlockType(blocks, "a", "divider")[0].content).toBe("")
  })

  it("inserts a paragraph after a code block instead of splitting the fence", () => {
    const blocks = [paragraph("code", "const n = 1", "code")]
    const result = splitBlock(blocks, "code", 5, 5, { createId: () => "next" })
    expect(result.blocks.map((block) => block.type)).toEqual(["code", "paragraph"])
    expect(result.blocks[0].content).toBe("const n = 1")
    expect(result.focusId).toBe("next")
  })
})
