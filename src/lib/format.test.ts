import { describe, expect, it } from "vitest"
import { clampIcon, cleanTitle, displayTitle, pickWorkspaceId, safeNextPath } from "@/lib/format"

describe("format", () => {
  it("falls back when a title is blank", () => {
    expect(displayTitle("   ")).toBe("未命名")
    expect(displayTitle("  路线图  ")).toBe("路线图")
  })

  it("keeps a trailing space out of the stored title length limit", () => {
    expect(cleanTitle("a\nb")).toBe("a b")
    expect(cleanTitle("x".repeat(250))).toHaveLength(200)
  })

  it("clamps emoji icons without dropping the fallback", () => {
    expect(clampIcon("", "📄")).toBe("📄")
    expect(clampIcon("  🚀  ", "📄")).toBe("🚀")
    expect(Array.from(clampIcon("📚✨🎯🌿🔥", "📄"))).toHaveLength(4)
  })

  it("prefers the last opened workspace when the user still belongs to it", () => {
    const workspaces = [{ id: "a" }, { id: "b" }]
    expect(pickWorkspaceId("b", workspaces)).toBe("b")
    expect(pickWorkspaceId("missing", workspaces)).toBe("a")
    expect(pickWorkspaceId(null, [])).toBeNull()
  })

  it("only allows in-app workspace paths after login", () => {
    expect(safeNextPath("/w/ws_product/p/page_welcome", "/w/home")).toBe("/w/ws_product/p/page_welcome")
    expect(safeNextPath("https://evil.test", "/w/home")).toBe("/w/home")
    expect(safeNextPath("//evil.test", "/w/home")).toBe("/w/home")
    expect(safeNextPath("/login", "/w/home")).toBe("/w/home")
  })
})
