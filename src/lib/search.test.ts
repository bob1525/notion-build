import { describe, expect, it } from "vitest"
import { makeSnippet, searchPages } from "@/lib/search"

const docs = [
  {
    id: "title-exact",
    title: "里程碑",
    icon: "🎯",
    updatedAt: "2026-11-01T00:00:00.000Z",
    blocks: [{ content: "无关正文" }],
  },
  {
    id: "title-partial",
    title: "Q4 里程碑",
    icon: "🎯",
    updatedAt: "2026-11-08T00:00:00.000Z",
    blocks: [{ content: "计划" }],
  },
  {
    id: "content",
    title: "欢迎来到 Folio",
    icon: "✨",
    updatedAt: "2026-11-09T00:00:00.000Z",
    blocks: [{ content: "export function wordCount(blocks: string[]) {\n  return blocks.length\n}" }],
  },
  {
    id: "older-content",
    title: "旧笔记",
    icon: "📄",
    updatedAt: "2026-01-01T00:00:00.000Z",
    blocks: [{ content: "这里也提到 wordCount，但是更早" }],
  },
]

describe("search", () => {
  it("returns nothing for a blank query", () => {
    expect(searchPages(docs, "   ")).toEqual([])
  })

  it("ranks an exact title above a partial title and above body matches", () => {
    const hits = searchPages(docs, "里程碑")
    expect(hits.map((hit) => hit.id)).toEqual(["title-exact", "title-partial"])
    expect(hits[0].match).toBe("title")
  })

  it("finds Chinese and code keywords inside block content", () => {
    const hits = searchPages(docs, "wordCount")
    expect(hits.map((hit) => hit.id)).toEqual(["content", "older-content"])
    expect(hits[0].snippet).toContain("wordCount")
    expect(hits[0].match).toBe("content")
  })

  it("ellipsizes a snippet around the match", () => {
    const snippet = makeSnippet(`${"前".repeat(80)}夜航草稿${"后".repeat(80)}`, "夜航草稿", 4)
    expect(snippet.startsWith("…")).toBe(true)
    expect(snippet.endsWith("…")).toBe(true)
    expect(snippet).toContain("夜航草稿")
  })
})
