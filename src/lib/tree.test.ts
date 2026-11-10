import { describe, expect, it } from "vitest"
import { ancestorIds, breadcrumbTitles, buildPageTree, collectDescendantIds } from "@/lib/tree"

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
