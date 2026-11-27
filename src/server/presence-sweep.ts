import "server-only"
import { prisma } from "@/lib/db"
import { PRESENCE_SWEEP_MS, staleBefore } from "@/lib/presence"

export async function sweepExpiredPresence(now = new Date()) {
  const result = await prisma.pagePresence.deleteMany({ where: { seenAt: { lt: staleBefore(now) } } })
  return result.count
}

export function startPresenceSweep() {
  const holder = globalThis as { __folioPresenceSweep?: ReturnType<typeof setInterval> }
  if (holder.__folioPresenceSweep) return
  const timer = setInterval(() => {
    void sweepExpiredPresence().catch(() => {})
  }, PRESENCE_SWEEP_MS)
  timer.unref?.()
  holder.__folioPresenceSweep = timer
}
