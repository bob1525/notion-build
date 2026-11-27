import { describe, expect, it } from "vitest"
import { createBlock } from "@/lib/blocks"
import {
  blocksBetween,
  decodeClipboardHtml,
  encodeClipboardHtml,
  insertPastedBlocks,
  paragraphsFromPlain,
  pasteInline,
  sliceInline,
} from "@/lib/clipboard"
import type { InlineMark } from "@/lib/types"

function paragraph(id: string, content: string) {
  return createBlock({ id, type: "paragraph", content })
}

describe("clipboard edges", () => {
  it("keeps an empty block, marks, and a nested child inside a cross-block range", () => {
    const quote = createBlock({ id: "quote", type: "quote", content: "引用" })
    const child = createBlock({ id: "child", type: "paragraph", content: "嵌套", parentId: "quote" })
    const empty = paragraph("empty", "")
    const linked = paragraph("linked", "看文档")
    linked.marks = [
      { type: "bold", start: 0, end: 1 },
      { type: "link", start: 1, end: 3, href: "https://example.com/docs" },
    ]
    const blocks = [quote, child, empty, linked]
    const picked = blocksBetween(blocks, "linked", "quote")
    expect(picked.map((block) => block.id)).toEqual(["quote", "child", "empty", "linked"])
    expect(picked[1]?.parentId).toBe("quote")
    expect(picked[3]?.marks).toEqual(linked.marks)
    expect(blocksBetween(blocks, "quote", "quote").map((block) => block.id)).toEqual(["quote", "child"])
  })

  it("copies a link with bold and pastes it into an empty block", () => {
    const marks: InlineMark[] = [
      { type: "bold", start: 0, end: 1 },
      { type: "link", start: 1, end: 3, href: "https://example.com/docs" },
    ]
    const sliced = sliceInline("看文档吧", marks, 0, 3)
    expect(sliced).toEqual({
      text: "看文档",
      marks: [
        { type: "bold", start: 0, end: 1 },
        { type: "link", start: 1, end: 3, href: "https://example.com/docs" },
      ],
    })
    expect(pasteInline("", [], 0, 0, sliced.text, sliced.marks)).toEqual({ content: sliced.text, marks: sliced.marks })
    const shifted = pasteInline("前后", [{ type: "bold", start: 1, end: 2 }], 1, 1, "中", [])
    expect(shifted).toEqual({ content: "前中后", marks: [{ type: "bold", start: 2, end: 3 }] })
  })

  it("replaces an empty paragraph and keeps an empty block from the pasted range", () => {
    let next = 0
    const createId = () => `n${next++}`
    const incoming = [paragraph("a", "甲"), paragraph("b", ""), paragraph("c", "乙")]
    const replaced = insertPastedBlocks([paragraph("empty", "")], "empty", incoming, createId)
    expect(replaced.blocks.map((block) => block.content)).toEqual(["甲", "", "乙"])
    expect(replaced.blocks.map((block) => block.id)).toEqual(["n0", "n1", "n2"])

    next = 0
    const appended = insertPastedBlocks([paragraph("keep", "已有")], "keep", [paragraph("a", "追加")], createId)
    expect(appended.blocks.map((block) => block.content)).toEqual(["已有", "追加"])
    expect(paragraphsFromPlain("甲\n\n乙\n").map((block) => block.content)).toEqual(["甲", "", "乙"])
  })

  it("round-trips clipboard html and drops an unsafe image address", () => {
    const image = createBlock({ id: "img", type: "image", src: "javascript:alert(1)", width: "small", content: "" })
    const safe = createBlock({ id: "ok", type: "image", src: "/uploads/11111111-1111-4111-8111-111111111111.png", width: "large" })
    const decoded = decodeClipboardHtml(encodeClipboardHtml({ kind: "blocks", blocks: [image, safe, paragraph("p", "说明")] }))
    expect(decoded?.kind).toBe("blocks")
    if (decoded?.kind !== "blocks") return
    expect(decoded.blocks.map((block) => block.src)).toEqual(["", "/uploads/11111111-1111-4111-8111-111111111111.png", ""])
    expect(decoded.blocks[1]?.width).toBe("large")
    expect(decoded.blocks[2]?.content).toBe("说明")
    expect(decodeClipboardHtml("<p>plain</p>")).toBeNull()
  })
})
