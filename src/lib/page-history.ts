import { normalizeBlocks } from "@/lib/blocks"
import { canEditPage, canViewPage } from "@/lib/permissions"
import type { BlockDTO, Role, Visibility } from "@/lib/types"

export const PAGE_HISTORY_COALESCE_MS = 5 * 60 * 1000
export const PAGE_HISTORY_MAX_SNAPSHOTS = 50
export const PAGE_HISTORY_MAX_CHARS = 400_000

export type SnapshotBody = {
  title: string
  icon: string
  cover: string
  blocks: string
}

export type SnapshotLatest = SnapshotBody & {
  editorId: string
  updatedAt: Date
}

type HistoryPage = {
  authorId: string
  visibility: Visibility
}

export function canReadPageHistory(userId: string, page: HistoryPage) {
  return canViewPage(userId, page)
}

export function canRestorePageHistory(userId: string, page: HistoryPage, role: Role) {
  return canEditPage(userId, page, role)
}

export function snapshotBody(input: { title: string; icon: string; cover: string; blocks: BlockDTO[] }): SnapshotBody {
  return {
    title: input.title,
    icon: input.icon,
    cover: input.cover,
    blocks: JSON.stringify(input.blocks),
  }
}

export function planSnapshot(input: {
  latest: SnapshotLatest | null
  editorId: string
  now: Date
  body: SnapshotBody
  forceNew?: boolean
  coalesceMs?: number
  maxChars?: number
}): "skip" | "fold" | "create" {
  const maxChars = input.maxChars ?? PAGE_HISTORY_MAX_CHARS
  if (input.body.blocks.length > maxChars) return "skip"
  if (!input.latest) return "create"
  if (input.forceNew) return "create"
  const same =
    input.latest.title === input.body.title &&
    input.latest.icon === input.body.icon &&
    input.latest.cover === input.body.cover &&
    input.latest.blocks === input.body.blocks
  if (same) return "skip"
  const elapsed = input.now.getTime() - input.latest.updatedAt.getTime()
  const coalesceMs = input.coalesceMs ?? PAGE_HISTORY_COALESCE_MS
  if (input.latest.editorId === input.editorId && elapsed >= 0 && elapsed < coalesceMs) return "fold"
  return "create"
}

export function idsToPrune(rows: { id: string; updatedAt: number }[], max = PAGE_HISTORY_MAX_SNAPSHOTS) {
  const sorted = [...rows].sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt
    if (left.id === right.id) return 0
    return left.id < right.id ? 1 : -1
  })
  return sorted.slice(Math.max(0, max)).map((row) => row.id)
}

export function parseSnapshotBlocks(raw: string): BlockDTO[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return normalizeBlocks(parsed as Array<{ id: string; type: BlockDTO["type"]; content?: string }>)
  } catch {
    return []
  }
}
