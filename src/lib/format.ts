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
  if (value === "public" || value === "edit" || value === "editable") return "public"
  if (value === "read" || value === "readonly" || value === "public-read" || value === "public_read") return "read"
  return "private"
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

function utcOffsetLabel(name: string) {
  const trimmed = name.replace(/\s/g, "")
  if (trimmed === "GMT" || trimmed === "UTC") return "UTC+00:00"
  const match = trimmed.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) return ""
  const hours = match[2].padStart(2, "0")
  const minutes = (match[3] ?? "00").padStart(2, "0")
  return `UTC${match[1]}${hours}:${minutes}`
}

export function formatZonedDateTime(iso: string, timeZone?: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const zone = timeZone?.trim() ? timeZone.trim() : undefined
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    }).formatToParts(date)
  } catch {
    return ""
  }
  const value = (type: Intl.DateTimeFormatPart["type"]) => parts.find((part) => part.type === type)?.value ?? ""
  const month = Number(value("month"))
  const day = Number(value("day"))
  const hour = value("hour") === "24" ? "00" : value("hour")
  const minute = value("minute")
  const offset = utcOffsetLabel(value("timeZoneName"))
  if (!month || !day || !/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute) || !offset) return ""
  return `${month}月${day}日 ${hour}:${minute}（${offset}）`
}

export function pickWorkspaceId(lastId: string | null | undefined, workspaces: { id: string }[]) {
  if (lastId && workspaces.some((workspace) => workspace.id === lastId)) return lastId
  return workspaces[0]?.id ?? null
}

export function safeNextPath(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/w/") || value.startsWith("//") || value.includes("\\")) return fallback
  return value
}
