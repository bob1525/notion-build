import { describe, expect, it } from "vitest"
import {
  PRESENCE_POLL_MS,
  PRESENCE_SWEEP_MS,
  PRESENCE_TTL_MS,
  activityFor,
  canAnnouncePresence,
  expiredPresenceIds,
  hasNewerRevision,
  isPresenceExpired,
  normalizeActivity,
  shouldAdoptRemote,
  visiblePeers,
} from "./presence"

const now = new Date("2026-11-27T10:00:00.000Z")

function peer(userId: string, ageMs: number) {
  return { userId, name: userId, seenAt: new Date(now.getTime() - ageMs), activity: "viewing" as const }
}

describe("presence", () => {
  it("shows fresh peers and hides self and stale heartbeats", () => {
    expect(PRESENCE_TTL_MS).toBe(20_000)
    expect(PRESENCE_POLL_MS).toBe(5_000)
    const rows = [
      peer("nash", 0),
      peer("mia", PRESENCE_TTL_MS),
      peer("old", PRESENCE_TTL_MS + 1),
    ]
    expect(visiblePeers(rows, now, "nash").map((row) => row.userId)).toEqual(["mia"])
    expect(visiblePeers(rows, now, "guest").map((row) => row.userId)).toEqual(["mia", "nash"])
  })

  it("notices a remote revision only when it is newer", () => {
    expect(hasNewerRevision(4, 5)).toBe(true)
    expect(hasNewerRevision(5, 5)).toBe(false)
    expect(hasNewerRevision(6, 5)).toBe(false)
  })

  it("records editing only for someone who can edit", () => {
    expect(normalizeActivity("editing", true)).toBe("editing")
    expect(normalizeActivity("editing", false)).toBe("viewing")
    expect(normalizeActivity("viewing", true)).toBe("viewing")
    expect(normalizeActivity("leave", true)).toBe("viewing")
    const readPage = { authorId: "nash", visibility: "read" as const }
    expect(activityFor("mia", readPage, "member", "editing")).toBe("viewing")
    expect(activityFor("mia", readPage, "owner", "editing")).toBe("editing")
    expect(activityFor("nash", readPage, "member", "editing")).toBe("editing")
    const publicPage = { authorId: "nash", visibility: "public" as const }
    expect(activityFor("mia", publicPage, "member", "editing")).toBe("editing")
  })

  it("selects heartbeats older than the window for the sweeper", () => {
    expect(PRESENCE_SWEEP_MS).toBe(5_000)
    const rows = [
      { id: "fresh", seenAt: now },
      { id: "edge", seenAt: new Date(now.getTime() - PRESENCE_TTL_MS) },
      { id: "stale", seenAt: new Date(now.getTime() - PRESENCE_TTL_MS - 1) },
    ]
    expect(expiredPresenceIds(rows, now)).toEqual(["stale"])
    expect(isPresenceExpired(rows[1].seenAt, now)).toBe(false)
    expect(isPresenceExpired(rows[2].seenAt, now)).toBe(true)
  })

  it("adopts a newer revision only when the local draft is unchanged", () => {
    expect(shouldAdoptRemote(true, 3, 4)).toBe(true)
    expect(shouldAdoptRemote(true, 4, 4)).toBe(false)
    expect(shouldAdoptRemote(true, 5, 4)).toBe(false)
    expect(shouldAdoptRemote(false, 3, 4)).toBe(false)
  })

  it("follows the same view rules as the page itself", () => {
    const author = "nash"
    const member = "mia"
    expect(canAnnouncePresence(author, { authorId: author, visibility: "private" })).toBe(true)
    expect(canAnnouncePresence(member, { authorId: author, visibility: "private" })).toBe(false)
    expect(canAnnouncePresence(member, { authorId: author, visibility: "public" })).toBe(true)
    expect(canAnnouncePresence(member, { authorId: author, visibility: "read" })).toBe(true)
  })
})
