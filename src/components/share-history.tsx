"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PageHistoryDialog } from "@/components/page-history-dialog"
import { Button, Dialog, useToast } from "@/components/ui"
import { ApiError, api } from "@/lib/api-client"

export function ShareHistory({
  pageId,
  revision,
  canRestore,
}: {
  pageId: string
  revision: number
  canRestore: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [conflictId, setConflictId] = useState<string | null>(null)

  async function restore(snapshotId: string, overwrite = false) {
    setRestoring(true)
    try {
      await api(`/api/pages/${pageId}/history/${snapshotId}/restore`, {
        method: "POST",
        body: JSON.stringify({ baseRevision: revision, overwrite }),
      })
      setConflictId(null)
      setOpen(false)
      toast("已恢复这个版本")
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && !overwrite) {
        setOpen(false)
        setConflictId(snapshotId)
        return
      }
      toast(error instanceof ApiError ? error.message : "没有恢复这个版本")
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="page-history"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]"
      >
        历史
      </button>
      <PageHistoryDialog
        open={open}
        pageId={pageId}
        canRestore={canRestore}
        restoring={restoring}
        historyPath={`/api/share/${pageId}/history`}
        onClose={() => setOpen(false)}
        onRestore={(snapshotId) => void restore(snapshotId)}
      />
      <Dialog open={conflictId !== null} title="恢复时发现页面已被修改" onClose={() => setConflictId((current) => current)} testId="conflict-dialog">
        <p className="text-sm leading-6 text-muted">这份历史还没写回去。覆盖会用所选版本替换当前页面，并记成一条新历史。放弃并刷新会保持别人刚保存的内容。</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="soft" data-testid="conflict-discard" onClick={() => { setConflictId(null); router.refresh() }}>放弃并刷新</Button>
          <Button data-testid="conflict-overwrite" disabled={restoring || !conflictId} onClick={() => conflictId && void restore(conflictId, true)}>覆盖</Button>
        </div>
      </Dialog>
    </>
  )
}
