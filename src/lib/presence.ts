import { canEditPage, canViewPage } from "@/lib/permissions"
import type { Role, Visibility } from "@/lib/types"

export const PRESENCE_TTL_MS = 20_000
export const PRESENCE_POLL_MS = 5_000
export const PRESENCE_SWEEP_MS = 5_000

export type PresenceActivity = "viewing" | "editing"

export type PresencePeer = {
  userId: string
  name: string
  activity: PresenceActivity
  seenAt: string
}

type PresencePage = {
  authorId: string
  visibility: Visibility
}

export function canAnnouncePresence(userId: string, page: PresencePage) {
  return canViewPage(userId, page)
}

export function normalizeActivity(requested: string, canEdit: boolean): PresenceActivity {
  if (requested === "editing" && canEdit) return "editing"
  return "viewing"
}

export function activityFor(userId: string, page: PresencePage, role: Role, requested: string): PresenceActivity {
  return normalizeActivity(requested, canEditPage(userId, page, role))
}

export function staleBefore(now: Date, ttl = PRESENCE_TTL_MS) {
  return new Date(now.getTime() - ttl)
}

export function visiblePeers<T extends { userId: string; seenAt: Date }>(rows: T[], now: Date, selfId: string, ttl = PRESENCE_TTL_MS) {
  const cutoff = now.getTime() - ttl
  return rows
    .filter((row) => row.userId !== selfId && row.seenAt.getTime() >= cutoff)
    .sort((left, right) => (left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : 0))
}

export function hasNewerRevision(localRevision: number, remoteRevision: number) {
  return remoteRevision > localRevision
}

export function isPresenceExpired(seenAt: Date, now: Date, ttl = PRESENCE_TTL_MS) {
  return seenAt.getTime() < now.getTime() - ttl
}

export function expiredPresenceIds<T extends { id: string; seenAt: Date }>(rows: T[], now: Date, ttl = PRESENCE_TTL_MS) {
  return rows.filter((row) => isPresenceExpired(row.seenAt, now, ttl)).map((row) => row.id)
}

export function shouldAdoptRemote(unchanged: boolean, localRevision: number, remoteRevision: number) {
  return unchanged && hasNewerRevision(localRevision, remoteRevision)
}
