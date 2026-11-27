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
