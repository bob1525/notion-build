import { describe, expect, it } from "vitest"
import { clampIcon, cleanTitle, displayTitle, formatDateTime, formatZonedDateTime, pickWorkspaceId, safeNextPath } from "@/lib/format"

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

  it("shows a snapshot clock in the requested timezone with an explicit offset", () => {
    const evening = "2026-11-27T16:30:00.000Z"
    expect(formatDateTime(evening)).toBe("11月27日 16:30")
    expect(formatZonedDateTime(evening, "Asia/Shanghai")).toBe("11月28日 00:30（UTC+08:00）")
    expect(formatZonedDateTime("2026-11-27T10:00:00.000Z", "Asia/Shanghai")).toBe("11月27日 18:00（UTC+08:00）")
    expect(formatZonedDateTime("2026-11-27T10:00:00.000Z", "UTC")).toBe("11月27日 10:00（UTC+00:00）")
    expect(formatZonedDateTime("2026-11-27T10:00:00.000Z", "America/New_York")).toBe("11月27日 05:00（UTC-05:00）")
    expect(formatZonedDateTime("2026-07-27T10:00:00.000Z", "America/New_York")).toBe("7月27日 06:00（UTC-04:00）")
    expect(formatZonedDateTime("2026-11-27T10:00:00.000Z", "Asia/Kolkata")).toBe("11月27日 15:30（UTC+05:30）")
    expect(formatZonedDateTime("not-a-date", "Asia/Shanghai")).toBe("")
    expect(formatZonedDateTime("2026-11-27T10:00:00.000Z", "Not/AZone")).toBe("")
  })

  it("uses the runtime timezone when a snapshot zone is omitted", () => {
    const iso = "2026-11-27T10:00:00.000Z"
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(formatZonedDateTime(iso)).toBe(formatZonedDateTime(iso, zone))
    expect(formatZonedDateTime(iso, "  ")).toBe(formatZonedDateTime(iso, zone))
    expect(formatZonedDateTime(iso)).toMatch(/（UTC[+-]\d{2}:\d{2}）$/)
  })

  it("only allows in-app workspace paths after login", () => {
    expect(safeNextPath("/w/ws_product/p/page_welcome", "/w/home")).toBe("/w/ws_product/p/page_welcome")
    expect(safeNextPath("https://evil.test", "/w/home")).toBe("/w/home")
    expect(safeNextPath("//evil.test", "/w/home")).toBe("/w/home")
    expect(safeNextPath("/login", "/w/home")).toBe("/w/home")
  })
})
