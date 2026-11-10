"use client"

import { ChevronDown, ChevronRight, FilePlus, Lock, LogOut, Pin, Plus, Search } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { useWorkspace } from "@/components/workspace-provider"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/cn"
import { displayTitle } from "@/lib/format"
import { ancestorIds, type TreeNode } from "@/lib/tree"
import type { PageMeta } from "@/lib/types"

export function Sidebar({ onSearch, onNavigate }: { onSearch: () => void; onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, workspace, pages, tree, favorites, createPage, openedPage } = useWorkspace()
  const currentId = openedPage?.id ?? pathname.match(/\/p\/([^/]+)/)?.[1] ?? null
  const storageKey = `folio-expanded-${workspace.id}`
  const [expanded, setExpanded] = useState<Record<string, boolean> | null>(null)
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey)
    if (raw) {
      try {
        setExpanded(JSON.parse(raw) as Record<string, boolean>)
        return
      } catch {
        // Ignore a corrupted preference and fall through to the default.
      }
    }
    const pageList = pagesRef.current
    const initial: Record<string, boolean> = {}
    for (const page of pageList) {
      if (pageList.some((child) => child.parentId === page.id)) initial[page.id] = true
    }
    setExpanded(initial)
  }, [storageKey])

  useEffect(() => {
    if (!expanded) return
    window.localStorage.setItem(storageKey, JSON.stringify(expanded))
  }, [expanded, storageKey])

  useEffect(() => {
    if (!currentId) return
    const byId = new Map(pages.map((page) => [page.id, page]))
    const ancestors = ancestorIds(currentId, byId)
    if (!ancestors.length) return
    setExpanded((current) => {
      const next = { ...(current ?? {}) }
      let changed = false
      for (const id of ancestors) {
        if (!next[id]) {
          next[id] = true
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [currentId, pages])

  const isOpen = (id: string) => (expanded ? Boolean(expanded[id]) : true)

  async function logout() {
    await api("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  return (
    <aside data-testid="sidebar" className="flex h-full w-[272px] shrink-0 flex-col bg-sidebar text-ink">
      <div className="px-2 pt-2">
        <WorkspaceSwitcher />
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
              onClick={() => void createPage()}
              className="rounded p-1 text-muted hover:bg-black/[0.06]"
            >
              <Plus size={15} />
            </button>
          }
        >
          {tree.length === 0 ? (
            <p className="px-2 py-1 text-xs leading-5 text-muted">还没有页面。点加号写下第一篇。</p>
          ) : (
            <PageTree
              nodes={tree}
              depth={0}
              currentId={currentId}
              isOpen={isOpen}
              onToggle={(id) => setExpanded((current) => ({ ...(current ?? {}), [id]: !isOpen(id) }))}
              onCreate={(parentId) => void createPage({ parentId })}
              onNavigate={onNavigate}
              workspaceId={workspace.id}
            />
          )}
        </Section>
      </div>
      <div className="border-t border-black/[0.06] p-2">
        <button
          type="button"
          onClick={() => void createPage()}
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
  onToggle,
  onCreate,
  onNavigate,
  workspaceId,
}: {
  nodes: TreeNode<PageMeta>[]
  depth: number
  currentId: string | null
  isOpen: (id: string) => boolean
  onToggle: (id: string) => void
  onCreate: (parentId: string) => void
  onNavigate?: () => void
  workspaceId: string
}) {
  return (
    <ul>
      {nodes.map((node) => {
        const open = isOpen(node.id)
        return (
          <li key={node.id}>
            <div className="group flex items-center" style={{ paddingLeft: depth * 12 }}>
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
                className="rounded p-1 text-muted opacity-0 hover:bg-black/[0.06] group-hover:opacity-100"
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
                onToggle={onToggle}
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
