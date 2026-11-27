"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ApiError, api } from "@/lib/api-client"
import { THEME_STORAGE_KEY, cycleTheme, readStoredTheme, readThemePreference, reconcileTheme, resolveTheme, themeLabel, type ThemePreference } from "@/lib/theme"

function systemIsDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function storedTheme() {
  try {
    return readStoredTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return null
  }
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
  const preferenceRef = useRef(preference)
  preferenceRef.current = preference
  const clicked = useRef(false)
  const tail = useRef(Promise.resolve())

  function persistTheme(theme: ThemePreference) {
    tail.current = tail.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await api("/api/me/theme", { method: "PUT", body: JSON.stringify({ theme }) })
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) return
        }
      })
  }

  useEffect(() => {
    const local = storedTheme()
    const shown = local ?? "system"
    setPreference(shown)
    applyTheme(shown)
    let cancel = false
    api<{ theme: ThemePreference | null }>("/api/me/theme")
      .then((data) => {
        if (cancel || clicked.current) return
        const decision = reconcileTheme(data.theme, local)
        setPreference(decision.applied)
        applyTheme(decision.applied)
        if (decision.persist) persistTheme(decision.persist)
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return
      })
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const current = readThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
      setPreference(current)
      applyTheme(current)
    }
    media.addEventListener("change", onChange)
    return () => {
      cancel = true
      media.removeEventListener("change", onChange)
    }
  }, [])

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      data-preference={preference}
      aria-label={`外观：${themeLabel(preference)}。点击切换`}
      onClick={() => {
        const next = cycleTheme(preferenceRef.current)
        clicked.current = true
        setPreference(next)
        applyTheme(next)
        persistTheme(next)
      }}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-black/[0.05] ${className}`}
    >
      {preference === "dark" ? <Moon size={14} /> : <Sun size={14} />}
      {themeLabel(preference)}
    </button>
  )
}
