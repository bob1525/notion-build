export const THEME_STORAGE_KEY = "folio-theme"

export type ThemePreference = "system" | "light" | "dark"
export type ResolvedTheme = "light" | "dark"

export function readThemePreference(value: string | null | undefined): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value
  return "system"
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light"
  return preference
}

export function cycleTheme(preference: ThemePreference): ThemePreference {
  if (preference === "system") return "light"
  if (preference === "light") return "dark"
  return "system"
}

export function themeLabel(preference: ThemePreference) {
  if (preference === "light") return "浅色"
  if (preference === "dark") return "深色"
  return "跟随系统"
}

export function readStoredTheme(value: string | null | undefined): ThemePreference | null {
  if (value === "light" || value === "dark" || value === "system") return value
  return null
}

export function reconcileTheme(account: ThemePreference | null, local: ThemePreference | null) {
  if (account) return { applied: account, persist: null as ThemePreference | null }
  if (local) return { applied: local, persist: local }
  return { applied: "system" as ThemePreference, persist: null as ThemePreference | null }
}

export function themeBootScript(account: ThemePreference | null) {
  const accountLiteral = JSON.stringify(account)
  return `(function () {
    try {
      var account = ${accountLiteral};
      var stored = null;
      try { stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch (e) {}
      var preference = "system";
      if (account === "light" || account === "dark" || account === "system") {
        preference = account;
        try { localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)}, account); } catch (e) {}
      } else if (stored === "light" || stored === "dark" || stored === "system") {
        preference = stored;
      }
      var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.style.colorScheme = theme;
    } catch (e) {}
  })();`
}
