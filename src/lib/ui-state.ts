const KEY = /^[A-Za-z0-9_-]{1,80}$/

export function readSidebar(raw: string | null | undefined, workspaceId: string): Record<string, boolean> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const workspace = (parsed as Record<string, unknown>)[workspaceId]
    return sanitizeSidebar(workspace)
  } catch {
    return {}
  }
}

export function writeSidebar(raw: string | null | undefined, workspaceId: string, sidebar: Record<string, boolean>) {
  let parsed: Record<string, unknown> = {}
  if (raw) {
    try {
      const value = JSON.parse(raw) as unknown
      if (value && typeof value === "object" && !Array.isArray(value)) parsed = { ...(value as Record<string, unknown>) }
    } catch {
      parsed = {}
    }
  }
  if (!KEY.test(workspaceId)) throw new Error("工作区标识无效")
  parsed[workspaceId] = sanitizeSidebar(sidebar)
  const keys = Object.keys(parsed).filter((key) => KEY.test(key))
  const kept = keys.slice(-40)
  const next: Record<string, unknown> = {}
  for (const key of kept) next[key] = key === workspaceId ? parsed[workspaceId] : sanitizeSidebar(parsed[key])
  return JSON.stringify(next)
}

export function sanitizeSidebar(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const result: Record<string, boolean> = {}
  for (const [key, open] of Object.entries(value)) {
    if (!KEY.test(key) || typeof open !== "boolean") continue
    result[key] = open
    if (Object.keys(result).length >= 500) break
  }
  return result
}
