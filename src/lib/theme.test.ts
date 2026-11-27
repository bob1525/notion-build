import { describe, expect, it } from "vitest"
import { cycleTheme, readThemePreference, resolveTheme, themeLabel } from "./theme"

describe("theme", () => {
  it("follows the system until a person picks light or dark", () => {
    expect(readThemePreference(null)).toBe("system")
    expect(readThemePreference("nope")).toBe("system")
    expect(readThemePreference("dark")).toBe("dark")
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("dark", false)).toBe("dark")
  })

  it("cycles system, light, then dark", () => {
    expect(cycleTheme("system")).toBe("light")
    expect(cycleTheme("light")).toBe("dark")
    expect(cycleTheme("dark")).toBe("system")
    expect(themeLabel("system")).toBe("跟随系统")
    expect(themeLabel("light")).toBe("浅色")
    expect(themeLabel("dark")).toBe("深色")
  })
})
