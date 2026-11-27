"use client"

import { ChevronRight, Eye, Globe, History, Link2, Lock, Pin, Star, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { BlockEditor, type BlockEditorHandle } from "@/components/block-editor"
import { PageHistoryDialog } from "@/components/page-history-dialog"
import { BlockView } from "@/components/block-view"
import { blocksFromMarkdown, markdownDraftFrom, MarkdownPane } from "@/components/markdown-pane"
import { Button, Dialog, useToast } from "@/components/ui"
import { useWorkspace } from "@/components/workspace-provider"
import { ApiError, api, pagePayload } from "@/lib/api-client"
import { ensureBlocks } from "@/lib/blocks"
import { COVERS, EMOJIS } from "@/lib/constants"
import { cn } from "@/lib/cn"
import { displayTitle, formatDateTime } from "@/lib/format"
import { canDeletePage, canEditPage, canManageVisibility } from "@/lib/permissions"
import { PRESENCE_POLL_MS, hasNewerRevision, shouldAdoptRemote, type PresencePeer } from "@/lib/presence"
import { comparePages } from "@/lib/tree"
import type { BlockDTO, PageDetail, PageMeta } from "@/lib/types"

function toMeta(page: PageDetail): PageMeta {
  const { authorName, blocks, ...meta } = page
  void authorName
  void blocks
  return meta
}

export function PageScreen({ initial }: { initial: PageDetail }) {
  const router = useRouter()
  const toast = useToast()
  const { user, workspace, pages, upsertPage, createPage, duplicatePage, removePageTree } = useWorkspace()
  const [meta, setMeta] = useState(initial)
  const [blocks, setBlocks] = useState(() => ensureBlocks(initial.blocks, initial.id))
  const [status, setStatus] = useState<"saved" | "saving" | "error" | "conflict">("saved")
  const [mode, setMode] = useState<"blocks" | "markdown">("blocks")
  const [markdown, setMarkdown] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictKind, setConflictKind] = useState<"save" | "restore">("save")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [peers, setPeers] = useState<PresencePeer[]>([])
  const [fresh, setFresh] = useState(false)
  const [refreshGuard, setRefreshGuard] = useState(false)
  const favoriteLock = useRef(false)
  const conflictLock = useRef(false)
  const pendingRestore = useRef<string | null>(null)
  const flushing = useRef(false)
  const flushAgain = useRef(false)
  const metaRef = useRef(meta)
  const blocksRef = useRef(blocks)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<BlockEditorHandle>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const editorActive = useRef(false)
  const ackedRevision = useRef(initial.revision)
  const remoteRevision = useRef(initial.revision)
  const loadedFingerprint = useRef(JSON.stringify(pagePayload(initial, blocks)))

  const syncFresh = useCallback(() => {
    setFresh(hasNewerRevision(ackedRevision.current, remoteRevision.current) && !conflictLock.current)
  }, [])

  const noteOwnRevision = useCallback((revision: number) => {
    ackedRevision.current = Math.max(ackedRevision.current, revision)
    syncFresh()
  }, [syncFresh])

  const noteRemoteRevision = useCallback((revision: number) => {
    remoteRevision.current = Math.max(remoteRevision.current, revision)
    syncFresh()
  }, [syncFresh])

  const adoptRevision = useCallback((revision: number) => {
    ackedRevision.current = revision
    remoteRevision.current = revision
    setFresh(false)
  }, [])

  useEffect(() => {
    const element = titleRef.current
    if (!element) return
    element.style.height = "0px"
    element.style.height = `${element.scrollHeight}px`
  }, [meta.title])

  useEffect(() => {
      return () => {
      if (timer.current) clearTimeout(timer.current)
      if (!dirty.current || conflictLock.current) return
      void fetch(`/api/pages/${metaRef.current.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pagePayload(metaRef.current, blocksRef.current)),
        keepalive: true,
      })
    }
  }, [])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault()
        setMode((current) => {
          if (current === "blocks") {
            setMarkdown(markdownDraftFrom(blocksRef.current))
            return "markdown"
          }
          return "blocks"
        })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const pageId = initial.id
    let stopped = false
    async function tick() {
      const target = document.activeElement as HTMLElement | null
      editorActive.current = Boolean(target?.closest?.("[data-testid='page-title'], [data-testid='block-input']"))
      const activity = dirty.current || flushing.current || editorActive.current ? "editing" : "viewing"
      try {
        const data = await api<{ revision: number; peers: PresencePeer[] }>(`/api/pages/${pageId}/presence`, {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({ activity }),
        })
        if (stopped) return
        setPeers(data.peers)
        noteRemoteRevision(data.revision)
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) stopped = true
      }
    }
    void tick()
    const interval = window.setInterval(() => {
      if (!stopped) void tick()
    }, PRESENCE_POLL_MS)
    const onFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null
      const active = Boolean(target?.closest?.("[data-testid='page-title'], [data-testid='block-input']"))
      editorActive.current = active
      if (active && !stopped) void tick()
    }
    const onBlur = () => {
      window.setTimeout(() => {
        const target = document.activeElement as HTMLElement | null
        editorActive.current = Boolean(target?.closest?.("[data-testid='page-title'], [data-testid='block-input']"))
      }, 0)
    }
    const leave = () => {
      void fetch(`/api/pages/${pageId}/presence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity: "leave" }),
        keepalive: true,
      })
    }
    window.addEventListener("focusin", onFocus)
    window.addEventListener("focusout", onBlur)
    window.addEventListener("pagehide", leave)
    return () => {
      stopped = true
      window.clearInterval(interval)
      window.removeEventListener("focusin", onFocus)
      window.removeEventListener("focusout", onBlur)
      window.removeEventListener("pagehide", leave)
    }
  }, [initial.id, noteRemoteRevision])

  function queueSave() {
    dirty.current = true
    if (conflictLock.current) return
    setStatus("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void flush()
    }, 500)
  }

  function applyPage(page: PageDetail, favorited = page.favorited) {
    const nextBlocks = ensureBlocks(page.blocks, page.id)
    const nextMeta = { ...page, favorited, blocks: nextBlocks }
    metaRef.current = nextMeta
    blocksRef.current = nextBlocks
    loadedFingerprint.current = JSON.stringify(pagePayload(nextMeta, nextBlocks))
    setMeta(nextMeta)
    setBlocks(nextBlocks)
    setMarkdown(markdownDraftFrom(nextBlocks))
    upsertPage(toMeta(nextMeta))
  }

  async function sendSnapshot(overwrite: boolean) {
    const snapshotMeta = metaRef.current
    const snapshotBlocks = blocksRef.current
    const fingerprint = JSON.stringify(pagePayload(snapshotMeta, snapshotBlocks))
    if (!overwrite && shouldAdoptRemote(fingerprint === loadedFingerprint.current, ackedRevision.current, remoteRevision.current)) {
      try {
        await applyLatest()
        return "saved" as const
      } catch (error) {
        setStatus("error")
        toast(error instanceof ApiError ? error.message : "没有换成新版本")
        return "error" as const
      }
    }
    try {
      const saved = await api<PageDetail>(`/api/pages/${snapshotMeta.id}`, {
        method: "PATCH",
        body: JSON.stringify(pagePayload(snapshotMeta, snapshotBlocks, { overwrite })),
      })
      noteOwnRevision(saved.revision)
      const latest = JSON.stringify(pagePayload(metaRef.current, blocksRef.current))
      const favorited = snapshotMeta.favorited === metaRef.current.favorited ? saved.favorited : metaRef.current.favorited
      if (latest === fingerprint) {
        dirty.current = false
        applyPage(saved, favorited)
        setStatus("saved")
        setConflictOpen(false)
        return "saved" as const
      }
      const nextMeta = { ...metaRef.current, favorited, revision: saved.revision, updatedAt: saved.updatedAt }
      metaRef.current = nextMeta
      setMeta(nextMeta)
      upsertPage(toMeta(nextMeta))
      return "again" as const
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        if (!overwrite && fingerprint === loadedFingerprint.current) {
          try {
            await applyLatest()
            return "saved" as const
          } catch (applyError) {
            setStatus("error")
            toast(applyError instanceof ApiError ? applyError.message : "没有换成新版本")
            return "error" as const
          }
        }
        pendingRestore.current = null
        conflictLock.current = true
        if (timer.current) clearTimeout(timer.current)
        dirty.current = true
        setConflictKind("save")
        setStatus("conflict")
        setConflictOpen(true)
        return "conflict" as const
      }
      setStatus("error")
      toast(error instanceof ApiError ? error.message : "保存失败")
      return "error" as const
    }
  }

  async function flush(overwrite = false) {
    if (overwrite) conflictLock.current = false
    if (conflictLock.current) return
    if (flushing.current) {
      flushAgain.current = true
      return
    }
    flushing.current = true
    try {
      let force = overwrite
      let result: "saved" | "again" | "conflict" | "error" = "saved"
      do {
        flushAgain.current = false
        result = await sendSnapshot(force)
        force = false
      } while (!conflictLock.current && result !== "error" && (result === "again" || flushAgain.current))
    } finally {
      flushing.current = false
    }
  }

  async function applyLatest() {
    if (timer.current) clearTimeout(timer.current)
    const latest = await api<PageDetail>(`/api/pages/${metaRef.current.id}`)
    dirty.current = false
    conflictLock.current = false
    adoptRevision(latest.revision)
    applyPage(latest)
    setRefreshGuard(false)
    setStatus("saved")
  }

  async function refreshRemote() {
    if (flushing.current) {
      toast("正在保存，请稍后再刷新")
      return
    }
    try {
      await applyLatest()
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "没有刷新页面")
    }
  }

  function requestRefresh() {
    if (flushing.current) {
      toast("正在保存，请稍后再刷新")
      return
    }
    if (dirty.current) {
      setRefreshGuard(true)
      return
    }
    void refreshRemote()
  }

  async function discardConflict() {
    pendingRestore.current = null
    try {
      const latest = await api<PageDetail>(`/api/pages/${metaRef.current.id}`)
      conflictLock.current = false
      dirty.current = false
      if (timer.current) clearTimeout(timer.current)
      adoptRevision(latest.revision)
      applyPage(latest)
      setConflictOpen(false)
      setStatus("saved")
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "没有刷新页面")
    }
  }

  async function overwriteConflict() {
    const snapshotId = pendingRestore.current
    setConflictOpen(false)
    if (snapshotId) {
      pendingRestore.current = null
      conflictLock.current = false
      await restoreSnapshot(snapshotId, true)
      return
    }
    await flush(true)
  }

  async function restoreSnapshot(snapshotId: string, overwrite = false) {
    if (!overwrite && (dirty.current || flushing.current)) {
      toast("还有没保存的修改。等保存完成后再恢复。")
      return
    }
    setRestoring(true)
    try {
      const saved = await api<PageDetail>(`/api/pages/${metaRef.current.id}/history/${snapshotId}/restore`, {
        method: "POST",
        body: JSON.stringify({ baseRevision: metaRef.current.revision, overwrite }),
      })
      pendingRestore.current = null
      conflictLock.current = false
      dirty.current = false
      if (timer.current) clearTimeout(timer.current)
      adoptRevision(saved.revision)
      applyPage(saved)
      setStatus("saved")
      setConflictOpen(false)
      setHistoryOpen(false)
      toast("已恢复这个版本")
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        pendingRestore.current = snapshotId
        conflictLock.current = true
        if (timer.current) clearTimeout(timer.current)
        dirty.current = true
        setConflictKind("restore")
        setStatus("conflict")
        setHistoryOpen(false)
        setConflictOpen(true)
        return
      }
      toast(error instanceof ApiError ? error.message : "没有恢复这个版本")
    } finally {
      setRestoring(false)
    }
  }

  function commitMeta(patch: Partial<PageDetail>, save = true) {
    const next = { ...metaRef.current, ...patch }
    metaRef.current = next
    setMeta(next)
    upsertPage(toMeta(next))
    if (save) queueSave()
  }

  function commitBlocks(nextBlocks: BlockDTO[]) {
    const normalized = ensureBlocks(nextBlocks, metaRef.current.id)
    blocksRef.current = normalized
    setBlocks(normalized)
    queueSave()
  }

  async function toggleFavorite() {
    if (favoriteLock.current) return
    favoriteLock.current = true
    const next = !metaRef.current.favorited
    commitMeta({ favorited: next }, false)
    try {
      const saved = await api<PageMeta>(`/api/pages/${metaRef.current.id}/favorite`, {
        method: "POST",
        body: JSON.stringify({ favorited: next }),
      })
      commitMeta({ favorited: saved.favorited }, false)
    } catch (error) {
      commitMeta({ favorited: !next }, false)
      toast(error instanceof ApiError ? error.message : "收藏没有保存")
    } finally {
      favoriteLock.current = false
    }
  }

  async function onDelete() {
    setDeleting(true)
    try {
      await api(`/api/pages/${meta.id}`, { method: "DELETE" })
      dirty.current = false
      removePageTree(meta.id)
      router.push(`/w/${workspace.id}`)
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "没有删除页面")
      setDeleting(false)
    }
  }

  async function copyPage(includeChildren: boolean) {
    setCopying(true)
    try {
      const rootId = await duplicatePage(meta.id, includeChildren)
      if (rootId) setCopyOpen(false)
    } finally {
      setCopying(false)
    }
  }

  async function copyShare() {
    const url = `${window.location.origin}/share/${meta.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast("已复制公开链接")
    } catch {
      toast(url)
    }
  }

  const crumbs: PageMeta[] = []
  const byId = new Map(pages.map((page) => [page.id, page]))
  let parentId = meta.parentId
  const guard = new Set<string>([meta.id])
  while (parentId && !guard.has(parentId)) {
    guard.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    crumbs.unshift(parent)
    parentId = parent.parentId
  }
  const children = pages.filter((page) => page.parentId === meta.id).sort(comparePages)
  const canEdit = canEditPage(user.id, meta, workspace.role)
  const canDelete = canDeletePage(user.id, workspace.role, meta)
  const canManage = canManageVisibility(user.id, workspace.role, meta)
  const blank = blocks.length === 1 && blocks[0]?.type === "paragraph" && !blocks[0].content
  const statusText = status === "saving" ? "保存中…" : status === "error" ? "保存失败" : status === "conflict" ? "发现冲突" : "已保存"

  return (
    <article data-testid="page-screen" className="pb-24">
      {meta.cover ? <div className={cn("h-40 w-full", `cover-${meta.cover}`)} /> : null}
      <div className="mx-auto w-full max-w-[920px] px-5 pt-8 sm:px-20">
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
          <Link href={`/w/${workspace.id}`} className="hover:text-ink">{workspace.icon} {workspace.name}</Link>
          {crumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight size={14} />
              <Link href={`/w/${workspace.id}/p/${crumb.id}`} className="hover:text-ink">
                {crumb.icon} {displayTitle(crumb.title)}
              </Link>
            </span>
          ))}
        </nav>

        <div className="relative">
          <button
            type="button"
            data-testid="page-icon"
            aria-label="更换图标"
            disabled={!canEdit}
            onClick={() => setIconOpen((open) => !open)}
            className="rounded-lg px-1 text-[56px] leading-none hover:bg-black/[0.04] disabled:hover:bg-transparent"
          >
            {meta.icon || "📄"}
          </button>
          {iconOpen ? (
            <div className="absolute left-0 z-20 mt-1 w-[292px] rounded-xl bg-white p-3 shadow-pop">
              <div className="grid grid-cols-8 gap-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="rounded-md py-1 text-xl hover:bg-black/[0.05]"
                    onClick={() => {
                      commitMeta({ icon: emoji })
                      setIconOpen(false)
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <textarea
          ref={titleRef}
          data-testid="page-title"
          value={meta.title}
          rows={1}
          readOnly={!canEdit}
          placeholder="未命名"
          aria-label="页面标题"
          onChange={(event) => {
            if (!canEdit) return
            commitMeta({ title: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              editorRef.current?.focusFirst()
            }
          }}
          className="mt-1 w-full resize-none bg-transparent text-[40px] font-bold leading-tight tracking-tight outline-none placeholder:text-black/15"
        />
        <p className="mb-3 text-xs text-faint">
          {meta.authorName} · 编辑于 {formatDateTime(meta.updatedAt)}
        </p>
        {peers.length > 0 ? (
          <div data-testid="presence-peers" role="status" aria-live="polite" aria-label="正在这页的其他人" className="mb-3 flex flex-wrap items-center gap-2">
            {peers.map((peer) => (
              <span
                key={peer.userId}
                data-testid="presence-peer"
                data-user-name={peer.name}
                data-activity={peer.activity}
                aria-label={`${peer.name}${peer.activity === "editing" ? "正在编辑" : "正在查看"}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] py-1 pl-1 pr-2 text-xs text-muted"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] font-medium text-white" aria-hidden>
                  {peer.name.slice(0, 1)}
                </span>
                {peer.name}
                {peer.activity === "editing" ? "正在编辑" : "正在查看"}
              </span>
            ))}
          </div>
        ) : null}
        {fresh && !conflictOpen ? (
          <div data-testid="presence-fresh" data-dirty={dirty.current ? "true" : "false"} role="status" aria-live="polite" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm">
            <span>
              有新版本。刷新后再改，可以少碰到保存冲突。
              {dirty.current ? "刷新会丢掉还没保存的修改。" : ""}
            </span>
            <button type="button" data-testid="presence-refresh" className="rounded-md bg-white px-2 py-1 text-xs shadow-card" onClick={requestRefresh}>
              刷新
            </button>
          </div>
        ) : null}

        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <div data-testid="visibility-control" data-visibility={meta.visibility} className="inline-flex rounded-md bg-black/[0.04] p-0.5">
            <button
              type="button"
              data-testid="visibility-private"
              aria-pressed={meta.visibility === "private"}
              disabled={!canManage}
              onClick={() => commitMeta({ visibility: "private" })}
              className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-xs", meta.visibility === "private" ? "bg-white shadow-card" : "text-muted")}
            >
              <Lock size={12} /> 私有
            </button>
            <button
              type="button"
              data-testid="visibility-read"
              aria-pressed={meta.visibility === "read"}
              disabled={!canManage}
              onClick={() => commitMeta({ visibility: "read" })}
              className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-xs", meta.visibility === "read" ? "bg-white shadow-card" : "text-muted")}
            >
              <Eye size={12} /> 只读
            </button>
            <button
              type="button"
              data-testid="visibility-public"
              aria-pressed={meta.visibility === "public"}
              disabled={!canManage}
              onClick={() => commitMeta({ visibility: "public" })}
              className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-xs", meta.visibility === "public" ? "bg-white shadow-card" : "text-muted")}
            >
              <Globe size={12} /> 可编辑
            </button>
          </div>
          <button
            type="button"
            data-testid="favorite-button"
            aria-pressed={meta.favorited}
            onClick={() => void toggleFavorite()}
            className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]", meta.favorited && "text-[#8a3d08]")}
          >
            <Star size={13} fill={meta.favorited ? "currentColor" : "none"} />
            {meta.favorited ? "已收藏" : "收藏"}
          </button>
          <button
            type="button"
            data-testid="pin-button"
            aria-pressed={meta.pinned}
            disabled={!canManage}
            onClick={() => commitMeta({ pinned: !meta.pinned })}
            className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]", meta.pinned && "text-accent")}
          >
            <Pin size={13} />
            {meta.pinned ? "已置顶" : "置顶"}
          </button>
          <button
            type="button"
            data-testid="add-subpage"
            disabled={!canEdit}
            onClick={() => void createPage({ parentId: meta.id })}
            className="rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]"
          >
            子页面
          </button>
          <button
            type="button"
            data-testid="copy-page"
            onClick={() => setCopyOpen(true)}
            className="rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]"
          >
            复制
          </button>
          {canEdit ? (
          <div className="inline-flex rounded-md bg-black/[0.04] p-0.5">
            <button type="button" data-testid="mode-blocks" onClick={() => setMode("blocks")} className={cn("rounded px-2 py-1 text-xs", mode === "blocks" && "bg-white shadow-card")}>可视化</button>
            <button
              type="button"
              data-testid="mode-markdown"
              onClick={() => {
                setMarkdown(markdownDraftFrom(blocksRef.current))
                setMode("markdown")
              }}
              className={cn("rounded px-2 py-1 text-xs", mode === "markdown" && "bg-white shadow-card")}
            >
              Markdown
            </button>
          </div>
          ) : null}
          {meta.visibility !== "private" ? (
            <button type="button" data-testid="copy-share" onClick={() => void copyShare()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]">
              <Link2 size={13} /> 复制链接
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" data-testid="delete-page" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-danger hover:bg-red-50">
              <Trash2 size={13} /> 删除
            </button>
          ) : null}
          <button
            type="button"
            data-testid="page-history"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]"
          >
            <History size={13} />
            历史
          </button>
          <span data-testid="save-status" className="ml-auto text-xs text-faint">
            {statusText}
            {status === "error" ? (
              <button type="button" data-testid="save-retry" className="ml-2 underline" onClick={() => void flush()}>重试</button>
            ) : null}
          </span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted">
          <span>封面</span>
          {COVERS.map((cover) => (
            <button
              key={cover.id || "none"}
              type="button"
              aria-label={`封面 ${cover.label}`}
              disabled={!canEdit}
              onClick={() => {
                if (canEdit) commitMeta({ cover: cover.id })
              }}
              className={cn(
                "h-5 w-5 rounded-full border border-black/10",
                cover.id ? `cover-${cover.id}` : "bg-white",
                meta.cover === cover.id && "ring-2 ring-ink ring-offset-1",
              )}
            />
          ))}
          <span data-testid="visibility-hint" className="ml-1">
            {meta.visibility === "private"
              ? "只有你能打开这篇"
              : meta.visibility === "read"
                ? "其他成员和公开链接都只能阅读"
                : "其他成员可以改正文，但不能改权限、置顶或删除。公开链接仍只能阅读"}
          </span>
        </div>

        {!canEdit ? <p data-testid="page-readonly" className="mb-4 text-sm text-muted">你只能阅读这篇。改权限、置顶和删除仍然留给作者或工作区所有者。</p> : null}
        {!canEdit ? (
          <BlockView blocks={blocks} />
        ) : mode === "blocks" ? (
          <BlockEditor editorRef={editorRef} blocks={blocks} onChange={commitBlocks} />
        ) : (
          <MarkdownPane source={markdown} blocks={blocks} onChange={(source) => {
            setMarkdown(source)
            commitBlocks(blocksFromMarkdown(source, blocksRef.current))
          }} />
        )}

        {blank && mode === "blocks" ? (
          <p className="mt-6 text-sm text-faint">输入 / 打开菜单。也可以用 #、##、-、1.、[] 再加一个空格，或连按 --- 与 ```。</p>
        ) : null}

        {children.length > 0 ? (
          <div data-testid="child-pages" className="mt-10 border-t border-black/[0.06] pt-4">
            <h2 className="mb-2 text-xs font-medium text-faint">子页面</h2>
            <div className="space-y-1">
              {children.map((child) => (
                <Link key={child.id} href={`/w/${workspace.id}/p/${child.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/[0.04]">
                  <span>{child.icon}</span>
                  <span className="truncate">{displayTitle(child.title)}</span>
                  {child.visibility === "private" ? <Lock size={12} className="text-faint" /> : null}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <PageHistoryDialog
        open={historyOpen}
        pageId={meta.id}
        canRestore={canEdit}
        restoring={restoring}
        onClose={() => setHistoryOpen(false)}
        onRestore={(snapshotId) => void restoreSnapshot(snapshotId)}
      />
      <Dialog open={refreshGuard} title="刷新会丢掉还没保存的修改" onClose={() => setRefreshGuard(false)} testId="presence-refresh-confirm">
        <p className="text-sm leading-6 text-muted">这一页在别处有新版本。刷新会丢掉你还没保存的修改，改成已经保存的内容。</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="soft" data-testid="presence-refresh-cancel" onClick={() => setRefreshGuard(false)}>留下我的修改</Button>
          <Button data-testid="presence-refresh-discard" onClick={() => void refreshRemote()}>仍要刷新</Button>
        </div>
      </Dialog>
      <Dialog open={conflictOpen} title={conflictKind === "restore" ? "恢复时发现页面已被修改" : "这篇页面在别处被修改了"} onClose={() => setConflictOpen(true)} testId="conflict-dialog">
        <p className="text-sm leading-6 text-muted">
          {conflictKind === "restore"
            ? "这份历史还没写回去。覆盖会用所选版本替换当前页面，并记成一条新历史。放弃并刷新会保持别人刚保存的内容。"
            : "你这次的修改还没写进去。覆盖会用你现在的内容替换已经保存的版本。放弃并刷新会丢掉你还没保存的修改，改回最新内容。本地没有要留下的修改时，上方的刷新会直接换成新版本。"}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="soft" data-testid="conflict-discard" onClick={() => void discardConflict()}>放弃并刷新</Button>
          <Button data-testid="conflict-overwrite" onClick={() => void overwriteConflict()}>覆盖</Button>
        </div>
      </Dialog>
      <Dialog open={copyOpen} title="复制页面" onClose={() => setCopyOpen(false)}>
        <p className="text-sm leading-6 text-muted">副本标题会加上“副本”。可以选择只复制这一页，或连同子页面一起复制。正文、列表和图片都会带上。</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="soft"
            data-testid="copy-shallow"
            disabled={copying}
            onClick={() => void copyPage(false)}
          >
            仅此页
          </Button>
          <Button data-testid="copy-deep" disabled={copying} onClick={() => void copyPage(true)}>
            {copying ? "复制中…" : "包含子页面"}
          </Button>
        </div>
      </Dialog>
      <Dialog open={confirmDelete} title="删除页面" onClose={() => setConfirmDelete(false)}>
        <p className="text-sm leading-6 text-muted">删除后，这篇页面和它的子页面都会消失。这个操作不能撤销。</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>取消</Button>
          <Button variant="danger" data-testid="confirm-delete" disabled={deleting} onClick={() => void onDelete()}>
            {deleting ? "删除中…" : "删除"}
          </Button>
        </div>
      </Dialog>
    </article>
  )
}
