import { describe, expect, it } from "vitest"
import { asVisibility } from "@/lib/format"
import { canDeletePage, canEditPage, canSharePage, canViewPage, pageSaveError } from "@/lib/permissions"

const author = "user_nash"
const other = "user_mia"
const owner = "user_owner"

const readPage = { authorId: author, visibility: "read" as const, pinned: false }
const editPage = { authorId: author, visibility: "public" as const, pinned: false }
const privatePage = { authorId: author, visibility: "private" as const, pinned: false }

describe("public read and public edit", () => {
  it("lets a read-only visitor view the page and rejects a write", () => {
    expect(canViewPage(other, readPage)).toBe(true)
    expect(canEditPage(other, readPage)).toBe(false)
    expect(canSharePage(readPage)).toBe(true)
    expect(pageSaveError(other, "member", readPage, { visibility: "read", pinned: false, contentChanged: true })).toBe("这篇页面对你是只读的")
    expect(pageSaveError(other, "member", readPage, { visibility: "read", pinned: false, contentChanged: false })).toBe("这篇页面对你是只读的")
  })

  it("lets an editable visitor change the body but not the permission, pin, or delete", () => {
    expect(canEditPage(other, editPage)).toBe(true)
    expect(pageSaveError(other, "member", editPage, { visibility: "public", pinned: false, contentChanged: true })).toBeNull()
    expect(pageSaveError(other, "member", editPage, { visibility: "read", pinned: false, contentChanged: false })).toBe("只有作者或工作区所有者可以修改权限")
    expect(pageSaveError(other, "member", editPage, { visibility: "public", pinned: true, contentChanged: false })).toBe("只有作者或工作区所有者可以修改权限")
    expect(canDeletePage(other, "member", editPage)).toBe(false)
  })

  it("rejects a visitor who cannot see a private page", () => {
    expect(canViewPage(other, privatePage)).toBe(false)
    expect(canEditPage(other, privatePage)).toBe(false)
    expect(canSharePage(privatePage)).toBe(false)
    expect(pageSaveError(other, "member", privatePage, { visibility: "private", pinned: false, contentChanged: true })).toBe("你没有查看这个页面的权限")
  })

  it("applies a level change to the next save", () => {
    expect(pageSaveError(other, "member", readPage, { visibility: "read", pinned: false, contentChanged: true })).toBe("这篇页面对你是只读的")
    expect(pageSaveError(other, "member", { ...readPage, visibility: "public" }, { visibility: "public", pinned: false, contentChanged: true })).toBeNull()
    expect(pageSaveError(other, "member", editPage, { visibility: "private", pinned: false, contentChanged: false })).toBe("只有作者或工作区所有者可以修改权限")
    expect(pageSaveError(other, "member", privatePage, { visibility: "private", pinned: false, contentChanged: true })).toBe("你没有查看这个页面的权限")
  })

  it("still lets the author edit a read-only page and lets the owner edit or manage it", () => {
    expect(canEditPage(author, readPage, "member")).toBe(true)
    expect(pageSaveError(author, "member", readPage, { visibility: "public", pinned: false, contentChanged: true })).toBeNull()
    expect(canEditPage(owner, readPage, "owner")).toBe(true)
    expect(pageSaveError(owner, "owner", readPage, { visibility: "private", pinned: true, contentChanged: true })).toBeNull()
    expect(canDeletePage(owner, "owner", readPage)).toBe(true)
  })

  it("keeps the old public value as editable and accepts the read aliases", () => {
    expect(asVisibility("public")).toBe("public")
    expect(asVisibility("edit")).toBe("public")
    expect(asVisibility("editable")).toBe("public")
    expect(asVisibility("read")).toBe("read")
    expect(asVisibility("readonly")).toBe("read")
    expect(asVisibility("public-read")).toBe("read")
    expect(asVisibility("nope")).toBe("private")
    expect(canEditPage(other, { authorId: author, visibility: asVisibility("public") })).toBe(true)
    expect(canEditPage(other, { authorId: author, visibility: asVisibility("read") })).toBe(false)
  })
})
