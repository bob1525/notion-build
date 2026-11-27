"use client"

import { useEffect, useRef, useState } from "react"
import { BlockView } from "@/components/block-view"
import { Button, Dialog, useToast } from "@/components/ui"
import { ApiError, api } from "@/lib/api-client"
import { cn } from "@/lib/cn"
import { formatDateTime } from "@/lib/format"
import { PAGE_HISTORY_COALESCE_MS } from "@/lib/page-history"
import type { PageHistoryEntry, PageHistoryPreview } from "@/lib/types"

export function PageHistoryDialog({
  open,
  pageId,
  canRestore,
  restoring,
  onClose,
  onRestore,
}: {
  open: boolean
  pageId: string
  canRestore: boolean
  restoring: boolean
  onClose: () => void
  onRestore: (snapshotId: string) => void
}) {
  const toast = useToast()
  const [items, setItems] = useState<PageHistoryEntry[] | null>(null)
  const [selectedId, setSelectedId] = useState("")
  const [preview, setPreview] = useState<PageHistoryPreview | null>(null)
  const [error, setError] = useState("")
  const previewToken = useRef(0)
  const minutes = PAGE_HISTORY_COALESCE_MS / 60_000

  useEffect(() => {
    if (!open) return
    let cancel = false
    setItems(null)
    setPreview(null)
    setSelectedId("")
    setError("")
    api<PageHistoryEntry[]>(`/api/pages/${pageId}/history`, { cache: "no-store" })
      .then((rows) => {
        if (!cancel) setItems(rows)
      })
      .catch((err: unknown) => {
        if (cancel) return
        setItems([])
        setError(err instanceof ApiError ? err.message : "没有读到历史")
      })
    return () => {
      cancel = true
    }
  }, [open, pageId])

  async function openPreview(snapshotId: string) {
    const token = ++previewToken.current
    setSelectedId(snapshotId)
    setPreview(null)
    try {
      const next = await api<PageHistoryPreview>(`/api/pages/${pageId}/history/${snapshotId}`, { cache: "no-store" })
      if (previewToken.current !== token) return
      setPreview(next)
    } catch (err: unknown) {
      if (previewToken.current !== token) return
      toast(err instanceof ApiError ? err.message : "没有打开这个版本")
    }
  }

  return (
    <Dialog open={open} title="页面历史" onClose={onClose} testId="history-dialog" wide>
      <p data-testid="history-policy" className="mb-3 text-xs leading-5 text-muted">
        同一人在 {minutes} 分钟内连续保存会合并成一条，时间记最后一次。恢复会写成新版本，并沿用现在的页面版本号。可见性和置顶保持不变。
      </p>
      {error ? <p data-testid="history-error" className="text-sm text-danger">{error}</p> : null}
      {items === null ? <p data-testid="history-loading" className="text-sm text-muted">正在读取历史…</p> : null}
      {items && items.length === 0 && !error ? (
        <p data-testid="history-empty" className="text-sm text-muted">还没有历史版本。改过标题、图标、封面或正文后会出现。</p>
      ) : null}
      {items && items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div data-testid="history-list" className="max-h-80 space-y-1 overflow-auto">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid="history-item"
                data-snapshot-id={item.id}
                data-editor={item.editorName}
                aria-pressed={selectedId === item.id}
                onClick={() => void openPreview(item.id)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left",
                  selectedId === item.id ? "bg-white shadow-card" : "hover:bg-black/[0.04]",
                )}
              >
                <span className="block text-xs text-ink">{formatDateTime(item.updatedAt)}</span>
                <span className="block text-xs text-muted">{item.editorName}</span>
              </button>
            ))}
          </div>
          <div data-testid="history-preview" className="max-h-80 overflow-auto rounded-md bg-black/[0.03] p-3">
            {preview ? (
              <>
                <h3 data-testid="history-preview-title" className="text-lg font-semibold">
                  {preview.icon} {preview.title || "未命名"}
                </h3>
                <p className="mb-3 text-xs text-muted">
                  {preview.editorName} · {formatDateTime(preview.updatedAt)}
                </p>
                <div data-testid="history-preview-body">
                  <BlockView blocks={preview.blocks} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">选一条历史查看当时的标题和正文。</p>
            )}
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex items-center justify-end gap-3">
        {canRestore ? (
          <Button data-testid="history-restore" disabled={restoring || !preview} onClick={() => preview && onRestore(preview.id)}>
            {restoring ? "正在恢复…" : "恢复这个版本"}
          </Button>
        ) : (
          <p data-testid="history-readonly" className="text-sm text-muted">你只能查看历史，不能恢复。</p>
        )}
      </div>
    </Dialog>
  )
}
