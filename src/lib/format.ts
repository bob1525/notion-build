import { BLOCK_TYPES, type BlockType, type Role, type Visibility } from "@/lib/types"

const COVERS = new Set(["", "warm", "mist", "moss", "ink", "rose"])

export function displayTitle(title: string) {
  const trimmed = title.replace(/\s+/g, " ").trim()
  return trimmed || "未命名"
}

export function cleanTitle(title: string) {
  return title.replace(/[\r\n]+/g, " ").slice(0, 200)
}

export function clampIcon(input: string | null | undefined, fallback: string) {
  const value = (input ?? "").trim()
  if (!value) return fallback
  return Array.from(value).slice(0, 4).join("")
}

export function asBlockType(value: string): BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value) ? (value as BlockType) : "paragraph"
}

export function asVisibility(value: string): Visibility {
  return value === "public" ? "public" : "private"
}

export function asRole(value: string): Role {
  return value === "owner" ? "owner" : "member"
}

export function asCover(value: string) {
  return COVERS.has(value) ? value : ""
}

export function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  const hours = `${date.getUTCHours()}`.padStart(2, "0")
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0")
  return `${month}月${day}日 ${hours}:${minutes}`
}

export function pickWorkspaceId(lastId: string | null | undefined, workspaces: { id: string }[]) {
  if (lastId && workspaces.some((workspace) => workspace.id === lastId)) return lastId
  return workspaces[0]?.id ?? null
}

export function safeNextPath(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/w/") || value.startsWith("//") || value.includes("\\")) return fallback
  return value
}
