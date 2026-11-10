"use client"

import { Lock, Pin, Star } from "lucide-react"
import Link from "next/link"
import { Button, EmptyState } from "@/components/ui"
import { useWorkspace } from "@/components/workspace-provider"
import { cn } from "@/lib/cn"
import { displayTitle, formatDateTime } from "@/lib/format"
import type { PageMeta } from "@/lib/types"

export function WorkspaceHome() {
  const { workspace, pages, favorites, createPage } = useWorkspace()
  const recent = [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)

  return (
    <div data-testid="workspace-home" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-4xl">{workspace.icon}</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{workspace.name}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {workspace.description || "把页面按树收好。公开的给同事看，私有的只留给自己。"}
          </p>
        </div>
        <Button data-testid="home-new-page" onClick={() => void createPage()}>新建页面</Button>
      </div>

      {pages.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-black/10">
          <EmptyState
            testId="empty-state"
            icon="📄"
            title="这个工作区还是空白的"
            body="从第一篇页面开始。标题、列表、待办和代码都可以慢慢长出来。"
            action={<Button data-testid="new-page-empty" onClick={() => void createPage()}>写下第一篇</Button>}
          />
        </div>
      ) : (
        <>
          {favorites.length > 0 ? (
            <section className="mt-10">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted"><Star size={14} /> 收藏</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {favorites.map((page) => <PageCard key={page.id} page={page} workspaceId={workspace.id} />)}
              </div>
            </section>
          ) : null}
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-muted">最近编辑</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recent.map((page) => <PageCard key={page.id} page={page} workspaceId={workspace.id} />)}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function PageCard({ page, workspaceId }: { page: PageMeta; workspaceId: string }) {
  return (
    <Link
      href={`/w/${workspaceId}/p/${page.id}`}
      className="group overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className={cn("h-16", page.cover ? `cover-${page.cover}` : "bg-sidebar")} />
      <div className="px-3 pb-3">
        <div className="-mt-4 text-2xl">{page.icon || "📄"}</div>
        <div className="mt-1 truncate font-medium">{displayTitle(page.title)}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-faint">
          <span>{formatDateTime(page.updatedAt)}</span>
          {page.pinned ? <Pin size={12} /> : null}
          {page.visibility === "private" ? <Lock size={12} /> : null}
        </div>
      </div>
    </Link>
  )
}
