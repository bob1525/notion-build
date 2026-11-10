import { describe, expect, it } from "vitest"
import { semanticBlocks } from "@/lib/blocks"
import { blocksToMarkdown, markdownToBlocks } from "@/lib/markdown"
import type { BlockDTO } from "@/lib/types"

const sample: BlockDTO[] = [
  { id: "1", type: "heading1", content: "少，但是清楚", checked: false, language: "", position: 0, marks: [] },
  { id: "2", type: "paragraph", content: "第一行\n第二行", checked: false, language: "", position: 1, marks: [] },
  { id: "3", type: "heading2", content: "清单", checked: false, language: "", position: 2, marks: [] },
  { id: "4", type: "bulleted", content: "记录", checked: false, language: "", position: 3, marks: [] },
  { id: "5", type: "numbered", content: "先写标题", checked: false, language: "", position: 4, marks: [] },
  { id: "6", type: "numbered", content: "再补列表", checked: false, language: "", position: 5, marks: [] },
  { id: "7", type: "todo", content: "勾选完成", checked: true, language: "", position: 6, marks: [] },
  { id: "8", type: "todo", content: "还没做", checked: false, language: "", position: 7, marks: [] },
  { id: "9", type: "divider", content: "ignored", checked: false, language: "", position: 8, marks: [] },
  { id: "10", type: "code", content: "const n = 1\n---\nconst y = 2", checked: false, language: "ts", position: 9, marks: [] },
  { id: "11", type: "heading3", content: "附注", checked: false, language: "", position: 10, marks: [] },
]

describe("markdown", () => {
  it("round-trips every supported block", () => {
    const markdown = blocksToMarkdown(sample)
    expect(markdown).toContain("# 少，但是清楚")
    expect(markdown).toContain("- [x] 勾选完成")
    expect(markdown).toContain("```ts")
    expect(semanticBlocks(markdownToBlocks(markdown))).toEqual(
      semanticBlocks(sample).map((block) => (block.type === "divider" ? { ...block, content: "" } : block)),
    )
  })

  it("keeps divider markers inside a code fence", () => {
    const blocks = markdownToBlocks("```\n---\n```\n")
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe("code")
    expect(blocks[0].content).toBe("---")
  })

  it("parses an unclosed fence and Windows newlines without throwing", () => {
    const blocks = markdownToBlocks("段落\r\n\r\n```python\r\nprint('hi')")
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "code"])
    expect(blocks[1].language).toBe("python")
    expect(blocks[1].content).toBe("print('hi')")
  })

  it("returns an empty list for blank markdown", () => {
    expect(markdownToBlocks("  \n\n")).toEqual([])
    expect(blocksToMarkdown([])).toBe("")
  })
})
