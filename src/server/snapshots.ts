import "server-only"
import type { Prisma } from "@prisma/client"
import { idsToPrune, planSnapshot, snapshotBody } from "@/lib/page-history"
import type { BlockDTO } from "@/lib/types"

export async function recordPageSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    pageId: string
    editorId: string
    title: string
    icon: string
    cover: string
    blocks: BlockDTO[]
    now: Date
    forceNew: boolean
  },
) {
  const body = snapshotBody(input)
  const latest = await tx.pageSnapshot.findFirst({
    where: { pageId: input.pageId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  })
  const action = planSnapshot({
    latest: latest
      ? {
          editorId: latest.editorId,
          updatedAt: latest.updatedAt,
          title: latest.title,
          icon: latest.icon,
          cover: latest.cover,
          blocks: latest.blocks,
        }
      : null,
    editorId: input.editorId,
    now: input.now,
    body,
    forceNew: input.forceNew,
  })
  if (action === "skip") return
  if (action === "fold" && latest) {
    await tx.pageSnapshot.update({
      where: { id: latest.id },
      data: {
        title: body.title,
        icon: body.icon,
        cover: body.cover,
        blocks: body.blocks,
        updatedAt: input.now,
      },
    })
  } else {
    await tx.pageSnapshot.create({
      data: {
        pageId: input.pageId,
        editorId: input.editorId,
        title: body.title,
        icon: body.icon,
        cover: body.cover,
        blocks: body.blocks,
        createdAt: input.now,
        updatedAt: input.now,
      },
    })
  }
  const rows = await tx.pageSnapshot.findMany({
    where: { pageId: input.pageId },
    select: { id: true, updatedAt: true },
  })
  const drop = idsToPrune(rows.map((row) => ({ id: row.id, updatedAt: row.updatedAt.getTime() })))
  if (drop.length) await tx.pageSnapshot.deleteMany({ where: { id: { in: drop } } })
}
