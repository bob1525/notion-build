import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { cycleTheme, readStoredTheme, readThemePreference, reconcileTheme, resolveTheme, themeBootScript, themeLabel, type ThemePreference } from "./theme"

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

  it("keeps the account choice when this browser disagrees and adopts a local choice only when the account has none", () => {
    expect(readStoredTheme(null)).toBeNull()
    expect(readStoredTheme("nope")).toBeNull()
    expect(readStoredTheme("light")).toBe("light")
    expect(reconcileTheme("dark", "light")).toEqual({ applied: "dark", persist: null })
    expect(reconcileTheme("system", "dark")).toEqual({ applied: "system", persist: null })
    expect(reconcileTheme(null, "light")).toEqual({ applied: "light", persist: "light" })
    expect(reconcileTheme(null, "system")).toEqual({ applied: "system", persist: "system" })
    expect(reconcileTheme(null, null)).toEqual({ applied: "system", persist: null })
  })

  it("paints the account theme before the page and leaves signed-out pages on local storage", () => {
    const signedIn = runBoot("light", "dark", true)
    expect(signedIn.theme).toBe("light")
    expect(signedIn.scheme).toBe("light")
    expect(signedIn.stored).toBe("light")

    const signedOut = runBoot(null, "dark", false)
    expect(signedOut.theme).toBe("dark")
    expect(signedOut.stored).toBe("dark")

    const fresh = runBoot(null, null, true)
    expect(fresh.theme).toBe("dark")
    expect(fresh.stored).toBeNull()

    const accountSystem = runBoot("system", "light", true)
    expect(accountSystem.theme).toBe("dark")
    expect(accountSystem.stored).toBe("system")
  })
})

function runBoot(account: ThemePreference | null, local: string | null, systemDark: boolean) {
  const store = new Map<string, string>()
  if (local !== null) store.set("folio-theme", local)
  const html = { theme: "" }
  const style = { colorScheme: "" }
  const context = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    },
    document: {
      documentElement: {
        setAttribute: (_name: string, value: string) => {
          html.theme = value
        },
        style,
      },
    },
    window: {
      matchMedia: () => ({ matches: systemDark }),
    },
  }
  runInNewContext(themeBootScript(account), context)
  return { theme: html.theme, scheme: style.colorScheme, stored: store.get("folio-theme") ?? null }
}
