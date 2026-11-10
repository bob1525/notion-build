"use client"

import { ChevronRight, Globe, Link2, Lock, Pin, Star, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { BlockEditor, type BlockEditorHandle } from "@/components/block-editor"
import { blocksFromMarkdown, markdownDraftFrom, MarkdownPane } from "@/components/markdown-pane"
import { Button, Dialog, useToast } from "@/components/ui"
import { useWorkspace } from "@/components/workspace-provider"
import { ApiError, api, pagePayload } from "@/lib/api-client"
import { ensureBlocks } from "@/lib/blocks"
import { COVERS, EMOJIS } from "@/lib/constants"
import { cn } from "@/lib/cn"
import { displayTitle, formatDateTime } from "@/lib/format"
import { canDeletePage, canManageVisibility } from "@/lib/permissions"
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
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved")
  const [mode, setMode] = useState<"blocks" | "markdown">("blocks")
  const [markdown, setMarkdown] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const favoriteLock = useRef(false)
  const metaRef = useRef(meta)
  const blocksRef = useRef(blocks)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<BlockEditorHandle>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = titleRef.current
    if (!element) return
    element.style.height = "0px"
    element.style.height = `${element.scrollHeight}px`
  }, [meta.title])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (!dirty.current) return
      void fetch(`/api/pages/${metaRef.current.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pagePayload(metaRef.current, blocksRef.current)),
        keepalive: true,
      })
    }
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

  function queueSave() {
    dirty.current = true
    setStatus("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void flush()
    }, 500)
  }

  async function flush() {
    const snapshotMeta = metaRef.current
    const snapshotBlocks = blocksRef.current
    const fingerprint = JSON.stringify(pagePayload(snapshotMeta, snapshotBlocks))
    try {
      const saved = await api<PageDetail>(`/api/pages/${snapshotMeta.id}`, {
        method: "PATCH",
        body: JSON.stringify(JSON.parse(fingerprint)),
      })
      const latest = JSON.stringify(pagePayload(metaRef.current, blocksRef.current))
      const favorited = snapshotMeta.favorited === metaRef.current.favorited ? saved.favorited : metaRef.current.favorited
      if (latest === fingerprint) {
        dirty.current = false
        const nextBlocks = ensureBlocks(saved.blocks, saved.id)
        const nextMeta = { ...saved, favorited, blocks: nextBlocks }
        metaRef.current = nextMeta
        blocksRef.current = nextBlocks
        setMeta(nextMeta)
        setBlocks(nextBlocks)
        setStatus("saved")
        upsertPage(toMeta(nextMeta))
      } else {
        const nextMeta = { ...metaRef.current, favorited, updatedAt: saved.updatedAt }
        metaRef.current = nextMeta
        setMeta(nextMeta)
        upsertPage(toMeta(nextMeta))
        queueSave()
      }
    } catch (error) {
      setStatus("error")
      toast(error instanceof ApiError ? error.message : "保存失败")
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
  const canDelete = canDeletePage(user.id, workspace.role, meta)
  const canVisibility = canManageVisibility(user.id, workspace.role, meta)
  const blank = blocks.length === 1 && blocks[0]?.type === "paragraph" && !blocks[0].content
  const statusText = status === "saving" ? "保存中…" : status === "error" ? "保存失败" : "已保存"

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
            onClick={() => setIconOpen((open) => !open)}
            className="rounded-lg px-1 text-[56px] leading-none hover:bg-black/[0.04]"
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
          placeholder="未命名"
          aria-label="页面标题"
          onChange={(event) => commitMeta({ title: event.target.value })}
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

        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <div data-testid="visibility-control" data-visibility={meta.visibility} className="inline-flex rounded-md bg-black/[0.04] p-0.5">
            <button
              type="button"
              data-testid="visibility-private"
              aria-pressed={meta.visibility === "private"}
              disabled={!canVisibility}
              onClick={() => commitMeta({ visibility: "private" })}
              className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-xs", meta.visibility === "private" ? "bg-white shadow-card" : "text-muted")}
            >
              <Lock size={12} /> 私有
            </button>
            <button
              type="button"
              data-testid="visibility-public"
              aria-pressed={meta.visibility === "public"}
              disabled={!canVisibility}
              onClick={() => commitMeta({ visibility: "public" })}
              className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-xs", meta.visibility === "public" ? "bg-white shadow-card" : "text-muted")}
            >
              <Globe size={12} /> 公开
            </button>
          </div>
          <button
            type="button"
            data-testid="favorite-button"
            aria-pressed={meta.favorited}
            onClick={() => void toggleFavorite()}
            className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]", meta.favorited && "text-amber-600")}
          >
            <Star size={13} fill={meta.favorited ? "currentColor" : "none"} />
            {meta.favorited ? "已收藏" : "收藏"}
          </button>
          <button
            type="button"
            data-testid="pin-button"
            aria-pressed={meta.pinned}
            onClick={() => commitMeta({ pinned: !meta.pinned })}
            className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]", meta.pinned && "text-accent")}
          >
            <Pin size={13} />
            {meta.pinned ? "已置顶" : "置顶"}
          </button>
          <button
            type="button"
            data-testid="add-subpage"
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
          {meta.visibility === "public" ? (
            <button type="button" data-testid="copy-share" onClick={() => void copyShare()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/[0.05]">
              <Link2 size={13} /> 复制链接
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" data-testid="delete-page" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-danger hover:bg-red-50">
              <Trash2 size={13} /> 删除
            </button>
          ) : null}
          <span data-testid="save-status" className="ml-auto text-xs text-faint">
            {statusText}
            {status === "error" ? (
              <button type="button" className="ml-2 underline" onClick={() => void flush()}>重试</button>
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
              onClick={() => commitMeta({ cover: cover.id })}
              className={cn(
                "h-5 w-5 rounded-full border border-black/10",
                cover.id ? `cover-${cover.id}` : "bg-white",
                meta.cover === cover.id && "ring-2 ring-ink ring-offset-1",
              )}
            />
          ))}
          <span className="ml-1">{meta.visibility === "private" ? "只有你能打开这篇" : "工作区成员可见，公开链接可只读"}</span>
        </div>

        {mode === "blocks" ? (
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
