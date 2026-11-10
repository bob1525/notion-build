"use client"

import { ChevronDown, ChevronRight, FilePlus, GripVertical, Lock, LogOut, Pin, Plus, Search } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useToast } from "@/components/ui"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { useWorkspace } from "@/components/workspace-provider"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/cn"
import { displayTitle } from "@/lib/format"
import { canMovePage } from "@/lib/permissions"
import { ancestorIds, planPageMove, type PagePlacement, type TreeNode } from "@/lib/tree"
import type { PageMeta } from "@/lib/types"

export function Sidebar({ onSearch, onNavigate }: { onSearch: () => void; onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const { user, workspace, pages, tree, favorites, createPage, movePage, openedPage, sidebarExpanded, saveSidebar } = useWorkspace()
  const currentId = openedPage?.id ?? pathname.match(/\/p\/([^/]+)/)?.[1] ?? null
  const [expanded, setExpanded] = useState<Record<string, boolean>>(sidebarExpanded)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; placement: PagePlacement; blocked: boolean } | null>(null)
  const [moveError, setMoveError] = useState("")
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  function rememberExpanded(next: Record<string, boolean>) {
    expandedRef.current = next
    setExpanded(next)
    saveSidebar(next)
  }

  useEffect(() => {
    if (!currentId) return
    const byId = new Map(pages.map((page) => [page.id, page]))
    const ancestors = ancestorIds(currentId, byId)
    if (!ancestors.length) return
    setExpanded((current) => {
      const next = { ...current }
      let changed = false
      for (const id of ancestors) {
        if (next[id] === undefined) {
          next[id] = true
          changed = true
        }
      }
      if (!changed) return current
      expandedRef.current = next
      saveSidebar(next)
      return next
    })
  }, [currentId, pages, saveSidebar])

  const isOpen = (id: string) => expanded[id] !== false

  function startPageDrag(pageId: string, event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    let active = false

    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
      active = true
      setDraggingId(pageId)
      const row = pageRowAt(ev.clientX, ev.clientY)
      const targetId = row?.dataset.pageId
      if (!row || !targetId) {
        setDrop(null)
        return
      }
      const placement = placementOnRow(row, ev.clientY)
      const plan = planPageMove(pagesRef.current, pageId, targetId, placement)
      setDrop({ id: targetId, placement, blocked: !plan.ok })
      setMoveError(plan.ok ? "" : plan.message)
      if (placement === "inside" && plan.ok && expandedRef.current[targetId] === false) {
        rememberExpanded({ ...expandedRef.current, [targetId]: true })
      }
    }

    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      setDraggingId(null)
      setDrop(null)
      if (!active) return
      const row = pageRowAt(ev.clientX, ev.clientY)
      const targetId = row?.dataset.pageId
      if (!row || !targetId) return
      const placement = placementOnRow(row, ev.clientY)
      const plan = planPageMove(pagesRef.current, pageId, targetId, placement)
      if (!plan.ok) {
        setMoveError(plan.message)
        toast(plan.message)
        return
      }
      setMoveError("")
      if (placement === "inside") {
        rememberExpanded({ ...expandedRef.current, [targetId]: true })
      }
      void movePage({ pageId, targetId, placement })
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  return (
    <aside data-testid="sidebar" className="flex h-full w-[min(272px,calc(100vw-3rem))] shrink-0 flex-col bg-sidebar text-ink md:w-[272px]">
      <div className="px-2 pt-2">
        <WorkspaceSwitcher onNavigate={onNavigate} />
        <button
          type="button"
          data-testid="search-open"
          onClick={onSearch}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-black/[0.04]"
        >
          <Search size={15} />
          <span className="flex-1">搜索</span>
          <kbd className="rounded border border-black/10 bg-white px-1.5 py-0.5 text-[10px] text-faint">⌘K</kbd>
        </button>
      </div>
      <div className="scrollbar-thin mt-3 flex-1 overflow-y-auto px-2 pb-4">
        {favorites.length > 0 ? (
          <Section title="收藏">
            {favorites.map((page) => (
              <PageLink key={page.id} page={page} href={`/w/${workspace.id}/p/${page.id}`} active={page.id === currentId} testId="favorite-link" onNavigate={onNavigate} />
            ))}
          </Section>
        ) : null}
        <Section
          title="页面"
          action={
            <button
              type="button"
              data-testid="new-page"
              aria-label="新建页面"
              onClick={() => {
                onNavigate?.()
                void createPage()
              }}
              className="rounded p-1 text-muted hover:bg-black/[0.06]"
            >
              <Plus size={15} />
            </button>
          }
        >
          <div className="relative">
          {moveError ? (
            <p data-testid="page-move-error" role="alert" className="pointer-events-none absolute left-2 right-2 top-0 z-20 rounded bg-white px-2 py-1 text-xs leading-5 text-danger shadow-card">
              {moveError}
            </p>
          ) : null}
          {tree.length === 0 ? (
            <p className="px-2 py-2 text-sm leading-6 text-muted">还没有页面。点加号写下第一篇。</p>
          ) : (
            <PageTree
              nodes={tree}
              depth={0}
              currentId={currentId}
              isOpen={isOpen}
              draggingId={draggingId}
              drop={drop}
              onDragStart={startPageDrag}
              onToggle={(id) => rememberExpanded({ ...expandedRef.current, [id]: expandedRef.current[id] === false })}
              canDrag={(page) => canMovePage(user.id, workspace.role, page)}
              onCreate={(parentId) => void createPage({ parentId })}
              onNavigate={onNavigate}
              workspaceId={workspace.id}
            />
          )}
          </div>
        </Section>
      </div>
      <div className="border-t border-black/[0.06] p-2">
        <button
          type="button"
          onClick={() => {
            onNavigate?.()
            void createPage()
          }}
          className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-black/[0.04]"
        >
          <FilePlus size={15} />
          新建页面
        </button>
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-medium text-white">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span data-testid="current-user" className="block truncate text-sm">{user.name}</span>
            <span className="block truncate text-xs text-faint">{user.email}</span>
          </span>
          <button type="button" data-testid="logout" aria-label="退出登录" onClick={() => void logout()} className="rounded p-1 text-muted hover:bg-black/[0.06]">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-1 flex items-center justify-between px-2">
        <h2 className="text-xs font-medium text-faint">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function PageTree({
  nodes,
  depth,
  currentId,
  isOpen,
  draggingId,
  drop,
  onDragStart,
  onToggle,
  canDrag,
  onCreate,
  onNavigate,
  workspaceId,
}: {
  nodes: TreeNode<PageMeta>[]
  depth: number
  currentId: string | null
  isOpen: (id: string) => boolean
  draggingId: string | null
  drop: { id: string; placement: PagePlacement; blocked: boolean } | null
  onDragStart: (pageId: string, event: React.PointerEvent<HTMLButtonElement>) => void
  onToggle: (id: string) => void
  canDrag: (page: PageMeta) => boolean
  onCreate: (parentId: string) => void
  onNavigate?: () => void
  workspaceId: string
}) {
  return (
    <ul>
      {nodes.map((node) => {
        const open = isOpen(node.id)
        const marked = drop?.id === node.id ? drop : null
        return (
          <li key={node.id}>
            <div
              data-testid="page-row"
              data-page-id={node.id}
              data-dragging={draggingId === node.id ? "true" : "false"}
              className="group relative flex min-h-7 items-center"
              style={{ paddingLeft: depth * 12 }}
            >
              {marked ? (
                <span
                  data-testid="page-drop-indicator"
                  data-placement={marked.placement}
                  data-blocked={marked.blocked ? "true" : "false"}
                  className={cn(
                    "pointer-events-none absolute z-10",
                    marked.placement === "before" && "left-2 right-2 top-0 h-0.5",
                    marked.placement === "after" && "bottom-0 left-2 right-2 h-0.5",
                    marked.placement === "inside" && "inset-x-1 inset-y-0.5 rounded-md border-2",
                    marked.blocked
                      ? marked.placement === "inside" ? "border-danger bg-danger/10" : "bg-danger"
                      : marked.placement === "inside" ? "border-accent bg-accent/10" : "bg-accent",
                  )}
                />
              ) : null}
              {canDrag(node) ? (
                <button
                  type="button"
                  data-testid="page-drag"
                  aria-label={`拖拽${displayTitle(node.title)}`}
                  onPointerDown={(event) => onDragStart(node.id, event)}
                  className="shrink-0 cursor-grab touch-none rounded p-0.5 text-faint hover:bg-black/[0.06] active:cursor-grabbing"
                >
                  <GripVertical size={14} />
                </button>
              ) : (
                <span className="w-[22px]" />
              )}
              {node.children.length > 0 ? (
                <button
                  type="button"
                  data-testid="toggle-children"
                  aria-label={open ? "折叠子页面" : "展开子页面"}
                  onClick={() => onToggle(node.id)}
                  className="rounded p-0.5 text-faint hover:bg-black/[0.06]"
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-[18px]" />
              )}
              <PageLink
                page={node}
                href={`/w/${workspaceId}/p/${node.id}`}
                active={node.id === currentId}
                depth={depth}
                onNavigate={onNavigate}
              />
              <button
                type="button"
                data-testid="add-child"
                aria-label={`在${displayTitle(node.title)}下新建子页面`}
                onClick={() => onCreate(node.id)}
                className="rounded p-1 text-muted opacity-100 hover:bg-black/[0.06] md:opacity-0 md:group-hover:opacity-100"
              >
                <Plus size={14} />
              </button>
            </div>
            {open && node.children.length > 0 ? (
              <PageTree
                nodes={node.children}
                depth={depth + 1}
                currentId={currentId}
                isOpen={isOpen}
                draggingId={draggingId}
                drop={drop}
                onDragStart={onDragStart}
                onToggle={onToggle}
                canDrag={canDrag}
                onCreate={onCreate}
                onNavigate={onNavigate}
                workspaceId={workspaceId}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function PageLink({
  page,
  href,
  active,
  depth = 0,
  testId = "page-link",
  onNavigate,
}: {
  page: PageMeta
  href: string
  active: boolean
  depth?: number
  testId?: string
  onNavigate?: () => void
}) {
  const title = displayTitle(page.title)
  return (
    <Link
      href={href}
      data-testid={testId}
      data-title={title}
      data-page-id={page.id}
      data-parent-id={page.parentId ?? ""}
      data-depth={depth}
      data-pinned={page.pinned ? "true" : "false"}
      data-visibility={page.visibility}
      aria-current={active ? "page" : undefined}
      title={title}
      onClick={onNavigate}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-black/[0.04]",
        active && "bg-black/[0.06] font-medium",
      )}
    >
      <span className="shrink-0 text-[15px] leading-none">{page.icon || "📄"}</span>
      <span className="truncate">{title}</span>
      {page.pinned ? <Pin size={12} className="shrink-0 text-faint" /> : null}
      {page.visibility === "private" ? <Lock size={12} className="shrink-0 text-faint" /> : null}
    </Link>
  )
}

function pageRowAt(x: number, y: number) {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof HTMLElement)) continue
    const row = element.closest("[data-testid='page-row']")
    if (row instanceof HTMLElement && row.dataset.pageId) return row
  }
  return null
}

function placementOnRow(row: HTMLElement, clientY: number): PagePlacement {
  const rect = row.getBoundingClientRect()
  const ratio = rect.height ? (clientY - rect.top) / rect.height : 0.5
  if (ratio < 0.28) return "before"
  if (ratio > 0.72) return "after"
  return "inside"
}

export function useCurrentTitle() {
  const pathname = usePathname()
  const { pages, workspace, openedPage } = useWorkspace()
  return useMemo(() => {
    if (openedPage) return displayTitle(pages.find((page) => page.id === openedPage.id)?.title ?? openedPage.title)
    const currentId = pathname.match(/\/p\/([^/]+)/)?.[1]
    if (!currentId) return workspace.name
    return displayTitle(pages.find((page) => page.id === currentId)?.title ?? workspace.name)
  }, [openedPage, pages, pathname, workspace.name])
}
