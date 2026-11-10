import { describe, expect, it } from "vitest"
import { canDeletePage, canEditPage, canManageVisibility, canViewPage } from "@/lib/permissions"

const author = "user_nash"
const other = "user_mia"

describe("permissions", () => {
  it("lets every member read a public page", () => {
    const page = { authorId: author, visibility: "public" as const }
    expect(canViewPage(other, page)).toBe(true)
    expect(canEditPage(other, page)).toBe(true)
  })

  it("hides a private page from everyone except its author", () => {
    const page = { authorId: author, visibility: "private" as const }
    expect(canViewPage(author, page)).toBe(true)
    expect(canViewPage(other, page)).toBe(false)
    expect(canEditPage(other, page)).toBe(false)
  })

  it("lets the author or a workspace owner change visibility and delete", () => {
    const page = { authorId: author }
    expect(canManageVisibility(author, "member", page)).toBe(true)
    expect(canManageVisibility(other, "member", page)).toBe(false)
    expect(canManageVisibility(other, "owner", page)).toBe(true)
    expect(canDeletePage(other, "member", page)).toBe(false)
    expect(canDeletePage(other, "owner", page)).toBe(true)
    expect(canDeletePage(author, "member", page)).toBe(true)
  })
})
