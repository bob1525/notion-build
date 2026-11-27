"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { THEME_STORAGE_KEY, cycleTheme, readThemePreference, resolveTheme, themeLabel, type ThemePreference } from "@/lib/theme"

function systemIsDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function applyTheme(preference: ThemePreference) {
  const theme = resolveTheme(preference, systemIsDark())
  document.documentElement.setAttribute("data-theme", theme)
  document.documentElement.style.colorScheme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // 隐私模式写不进本地存储时，这一页仍然按当前选择显示。
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [preference, setPreference] = useState<ThemePreference>("system")

  useEffect(() => {
    const stored = readThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
    setPreference(stored)
    applyTheme(stored)
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const current = readThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
      setPreference(current)
      applyTheme(current)
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      data-preference={preference}
      aria-label={`外观：${themeLabel(preference)}。点击切换`}
      onClick={() => {
        const next = cycleTheme(preference)
        setPreference(next)
        applyTheme(next)
      }}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-black/[0.05] ${className}`}
    >
      {preference === "dark" ? <Moon size={14} /> : <Sun size={14} />}
      {themeLabel(preference)}
    </button>
  )
}
