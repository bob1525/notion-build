import "server-only"
import { prisma } from "@/lib/db"
import { canAnnouncePresence, activityFor, staleBefore, visiblePeers, type PresenceActivity } from "@/lib/presence"
import { sweepExpiredPresence } from "@/server/presence-sweep"
import { loadPageDetail } from "@/server/content"
import { HttpError } from "@/server/http"

export async function touchPresence(userId: string, pageId: string, requested: PresenceActivity | "leave") {
  const loaded = await loadPageDetail(userId, pageId)
  if (loaded.kind === "missing") throw new HttpError(404, "找不到这个页面")
  if (loaded.kind !== "ok" || !canAnnouncePresence(userId, loaded.page)) {
    throw new HttpError(403, "你没有查看这个页面的权限")
  }
  const now = new Date()
  if (requested === "leave") {
    await prisma.pagePresence.deleteMany({ where: { pageId, userId } })
  } else {
    const activity = activityFor(userId, loaded.page, loaded.role, requested)
    await prisma.pagePresence.upsert({
      where: { pageId_userId: { pageId, userId } },
      create: { pageId, userId, activity, seenAt: now },
      update: { activity, seenAt: now },
    })
  }
  await sweepExpiredPresence(now)
  const rows = await prisma.pagePresence.findMany({
    where: { pageId, seenAt: { gte: staleBefore(now) } },
    include: { user: { select: { name: true } } },
  })
  const peers = visiblePeers(
    rows.map((row) => ({
      userId: row.userId,
      name: row.user.name,
      activity: row.activity === "editing" ? ("editing" as const) : ("viewing" as const),
      seenAt: row.seenAt,
    })),
    now,
    userId,
  ).map((peer) => ({
    userId: peer.userId,
    name: peer.name,
    activity: peer.activity,
    seenAt: peer.seenAt.toISOString(),
  }))
  const latest = await prisma.page.findUnique({ where: { id: pageId }, select: { revision: true } })
  return { revision: latest?.revision ?? loaded.page.revision, peers }
}
