import { describe, expect, it } from "vitest"
import {
  ancestorIds,
  breadcrumbTitles,
  buildPageTree,
  collectDescendantIds,
  PAGE_MOVE_DESCENDANT,
  PAGE_MOVE_SELF,
  planPageCopy,
  planPageMove,
} from "@/lib/tree"

const pages = [
  { id: "root-b", parentId: null, pinned: false, position: 1, title: "乙" },
  { id: "child", parentId: "root-a", pinned: false, position: 0, title: "子页面" },
  { id: "root-a", parentId: null, pinned: true, position: 5, title: "甲" },
  { id: "grandchild", parentId: "child", pinned: true, position: 2, title: "孙页面" },
  { id: "orphan", parentId: "missing", pinned: false, position: 0, title: "游离" },
]

describe("page tree", () => {
  it("nests pages and floats pinned siblings ahead of their position", () => {
    const tree = buildPageTree(pages)
    expect(tree.map((node) => node.id)).toEqual(["root-a", "orphan", "root-b"])
    expect(tree[0].children.map((node) => node.id)).toEqual(["child"])
    expect(tree[0].children[0].children.map((node) => node.id)).toEqual(["grandchild"])
  })

  it("does not loop when two pages point at each other", () => {
    const tree = buildPageTree([
      { id: "a", parentId: "b", pinned: false, position: 0, title: "A" },
      { id: "b", parentId: "a", pinned: false, position: 1, title: "B" },
    ])
    expect(tree).toHaveLength(2)
    expect(tree.every((node) => node.children.length === 0)).toBe(true)
  })

  it("collects descendants and breadcrumbs without walking a cycle", () => {
    expect(collectDescendantIds(pages, "root-a").sort()).toEqual(["child", "grandchild", "root-a"])
    const byId = new Map(pages.map((page) => [page.id, page]))
    expect(breadcrumbTitles("grandchild", byId)).toEqual(["甲", "子页面"])
    expect(ancestorIds("grandchild", byId)).toEqual(["child", "root-a"])
    expect(breadcrumbTitles("a", new Map([
      ["a", { title: "A", parentId: "b" }],
      ["b", { title: "B", parentId: "a" }],
    ]))).toEqual(["B"])
  })
})

function flat(ids: string[], parent: Record<string, string | null> = {}) {
  return ids.map((id, index) => ({
    id,
    parentId: parent[id] ?? null,
    pinned: false,
    position: index,
    title: id,
  }))
}

function visualOrder(pages: { id: string; parentId: string | null; position: number; pinned?: boolean }[], parentId: string | null) {
  return pages
    .filter((page) => page.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map((page) => page.id)
}

describe("planPageMove", () => {
  it("reorders a page to the first, middle, and last slot among siblings", () => {
    const pages = flat(["甲", "乙", "丙"])
    const first = planPageMove(pages, "丙", "甲", "before")
    const middle = planPageMove(pages, "丙", "乙", "before")
    const last = planPageMove(pages, "甲", "丙", "after")
    expect(first.ok && visualOrder(first.pages, null)).toEqual(["丙", "甲", "乙"])
    expect(middle.ok && visualOrder(middle.pages, null)).toEqual(["甲", "丙", "乙"])
    expect(last.ok && visualOrder(last.pages, null)).toEqual(["乙", "丙", "甲"])
    expect(pages.map((page) => page.position)).toEqual([0, 1, 2])
  })

  it("moves a page inside another page and back out to the parent level", () => {
    const pages = flat(["甲", "乙", "丙"])
    const inside = planPageMove(pages, "丙", "甲", "inside")
    expect(inside.ok).toBe(true)
    if (!inside.ok) return
    expect(inside.pages.find((page) => page.id === "丙")).toMatchObject({ parentId: "甲", position: 0 })
    expect(visualOrder(inside.pages, null)).toEqual(["甲", "乙"])

    const out = planPageMove(inside.pages, "丙", "甲", "before")
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.pages.find((page) => page.id === "丙")).toMatchObject({ parentId: null, position: 0 })
    expect(visualOrder(out.pages, null)).toEqual(["丙", "甲", "乙"])
  })

  it("rejects a drop onto itself, onto a descendant, or beside its own child", () => {
    const pages = flat(["甲", "乙", "丙"], { 乙: "甲", 丙: "乙" })
    expect(planPageMove(pages, "甲", "甲", "inside")).toEqual({ ok: false, message: PAGE_MOVE_SELF })
    expect(planPageMove(pages, "甲", "乙", "inside")).toEqual({ ok: false, message: PAGE_MOVE_DESCENDANT })
    expect(planPageMove(pages, "甲", "丙", "inside")).toEqual({ ok: false, message: PAGE_MOVE_DESCENDANT })
    expect(planPageMove(pages, "甲", "乙", "before")).toEqual({ ok: false, message: PAGE_MOVE_DESCENDANT })
    expect(pages.map((page) => page.parentId)).toEqual([null, "甲", "乙"])
  })

  it("keeps an unpinned page in the unpinned group when it is dropped before a pinned page", () => {
    const pages = [
      { id: "置顶", parentId: null, pinned: true, position: 0, title: "置顶" },
      { id: "甲", parentId: null, pinned: false, position: 1, title: "甲" },
      { id: "乙", parentId: null, pinned: false, position: 2, title: "乙" },
    ]
    const moved = planPageMove(pages, "乙", "置顶", "before")
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(visualOrder(moved.pages, null)).toEqual(["置顶", "乙", "甲"])
  })
})

describe("planPageCopy", () => {
  const pages = [
    { id: "甲", parentId: null, title: "会议" },
    { id: "乙", parentId: "甲", title: "纪要" },
    { id: "丙", parentId: "乙", title: "" },
  ]

  it("copies one page without its children and adds 副本 to the title", () => {
    const plan = planPageCopy(pages, "甲", false)
    expect(plan).toEqual({
      ok: true,
      copies: [{ sourceId: "甲", title: "会议 副本", parentSourceId: null }],
    })
  })

  it("copies descendants, remaps their parents, and names a blank page 未命名 副本", () => {
    expect(planPageCopy(pages, "甲", true)).toEqual({
      ok: true,
      copies: [
        { sourceId: "甲", title: "会议 副本", parentSourceId: null },
        { sourceId: "乙", title: "纪要", parentSourceId: "甲" },
        { sourceId: "丙", title: "", parentSourceId: "乙" },
      ],
    })
    expect(planPageCopy(pages, "丙", false)).toEqual({
      ok: true,
      copies: [{ sourceId: "丙", title: "未命名 副本", parentSourceId: null }],
    })
  })
})
