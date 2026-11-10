import { describe, expect, it } from "vitest"
import { canDeletePage, canEditPage, canFindInSearch, canManageVisibility, canSharePage, canViewPage } from "@/lib/permissions"
import { searchPages } from "@/lib/search"

const author = "user_nash"
const other = "user_mia"
const owner = "user_owner"
const privatePage = { authorId: author, visibility: "private" as const }
const publicPage = { authorId: author, visibility: "public" as const }

describe("permission matrix", () => {
  it("lets the author read a private page", () => {
    expect(canViewPage(author, privatePage)).toBe(true)
  })

  it("hides a private page from another member", () => {
    expect(canViewPage(other, privatePage)).toBe(false)
  })

  it("lets another member read a public page", () => {
    expect(canViewPage(other, publicPage)).toBe(true)
  })

  it("lets the author edit a private page", () => {
    expect(canEditPage(author, privatePage)).toBe(true)
  })

  it("stops another member from editing a private page", () => {
    expect(canEditPage(other, privatePage)).toBe(false)
  })

  it("lets another member edit a public page", () => {
    expect(canEditPage(other, publicPage)).toBe(true)
  })

  it("stops another member from deleting someone else's page", () => {
    expect(canDeletePage(other, "member", privatePage)).toBe(false)
    expect(canDeletePage(other, "member", publicPage)).toBe(false)
  })

  it("lets a workspace owner delete someone else's page", () => {
    expect(canDeletePage(owner, "owner", privatePage)).toBe(true)
    expect(canDeletePage(owner, "owner", publicPage)).toBe(true)
  })

  it("lets the author delete their own page", () => {
    expect(canDeletePage(author, "member", privatePage)).toBe(true)
  })

  it("stops another member from changing visibility, and lets the owner or author do it", () => {
    expect(canManageVisibility(other, "member", privatePage)).toBe(false)
    expect(canManageVisibility(owner, "owner", privatePage)).toBe(true)
    expect(canManageVisibility(author, "member", publicPage)).toBe(true)
  })

  it("shares only public pages", () => {
    expect(canSharePage(privatePage)).toBe(false)
    expect(canSharePage(publicPage)).toBe(true)
  })

  it("omits private pages from another member's search and keeps them for the author", () => {
    const docs = [
      { id: "secret", authorId: author, visibility: "private" as const, title: "私人草稿", icon: "🔒", updatedAt: "2026-11-02T00:00:00.000Z", blocks: [{ content: "夜航草稿只给作者" }] },
      { id: "open", authorId: author, visibility: "public" as const, title: "公开备忘", icon: "📄", updatedAt: "2026-11-03T00:00:00.000Z", blocks: [{ content: "夜航草稿的公开版" }] },
    ]
    const visibleTo = (userId: string) => docs.filter((page) => canFindInSearch(userId, page))
    expect(searchPages(visibleTo(other), "夜航草稿").map((hit) => hit.id)).toEqual(["open"])
    expect(searchPages(visibleTo(author), "夜航草稿").map((hit) => hit.id)).toEqual(["open", "secret"])
    expect(searchPages(visibleTo(other), "私人草稿", 20, "title")).toEqual([])
    expect(searchPages(visibleTo(author), "夜航草稿", 20, "content").map((hit) => hit.id)).toEqual(["open", "secret"])
  })
})
