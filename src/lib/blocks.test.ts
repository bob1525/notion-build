import { describe, expect, it } from "vitest"
import { ensureBlocks, normalizeBlocks, withPositions } from "@/lib/blocks"

describe("blocks", () => {
  it("normalizes positions, clears dividers, and rewrites duplicate ids", () => {
    const blocks = normalizeBlocks([
      { id: "same", type: "divider", content: "nope", checked: true, language: "ts" },
      { id: "same", type: "todo", content: "买牛奶", checked: true, language: "" },
      { id: "code", type: "code", content: "let x = 1", checked: false, language: " TypeScript " },
    ])
    expect(blocks.map((block) => block.position)).toEqual([0, 1, 2])
    expect(blocks[0]).toMatchObject({ type: "divider", content: "", checked: false, language: "" })
    expect(blocks[1].id).not.toBe(blocks[0].id)
    expect(blocks[1]).toMatchObject({ type: "todo", checked: true, content: "买牛奶" })
    expect(blocks[2].language).toBe("typescript")
  })

  it("uses a stable empty paragraph so server and client markup match", () => {
    expect(ensureBlocks([], "page_1")).toEqual([
      { id: "empty-page_1", type: "paragraph", content: "", checked: false, language: "", position: 0, marks: [], parentId: "", collapsed: false, src: "", width: "" },
    ])
    expect(ensureBlocks([
      { id: "a", type: "paragraph", content: "hi", checked: false, language: "", position: 4, marks: [], parentId: "", collapsed: false, src: "", width: "" },
    ], "page_1")[0].position).toBe(0)
  })

  it("keeps untouched block objects when one block changes", () => {
    const original = withPositions([
      { id: "a", type: "paragraph", content: "甲", checked: false, language: "", position: 0, marks: [], parentId: "", collapsed: false, src: "", width: "" },
      { id: "b", type: "paragraph", content: "乙", checked: false, language: "", position: 1, marks: [], parentId: "", collapsed: false, src: "", width: "" },
    ])
    const edited = withPositions(original.map((block) => block.id === "b" ? { ...block, content: "乙二" } : block))
    expect(edited[0]).toBe(original[0])
    expect(edited[1]).not.toBe(original[1])
    expect(edited[1].content).toBe("乙二")
    expect(withPositions(edited)).toBe(edited)
  })
})
