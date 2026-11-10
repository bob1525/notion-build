import type { Metadata } from "next"
import Link from "next/link"
import { BlockView } from "@/components/block-view"
import { Button, EmptyState, Logo } from "@/components/ui"
import { cn } from "@/lib/cn"
import { formatDateTime } from "@/lib/format"
import { loadPublicPage } from "@/server/content"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ pageId: string }> }): Promise<Metadata> {
  const page = await loadPublicPage((await params).pageId)
  return { title: page?.title ?? "公开页面" }
}

export default async function SharePage({ params }: { params: Promise<{ pageId: string }> }) {
  const page = await loadPublicPage((await params).pageId)
  if (!page) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6">
        <Logo />
        <EmptyState
          testId="share-missing"
          icon="🔗"
          title="找不到这篇公开页"
          body="它可能是私有的，或者链接已经失效。私有页面不会通过分享地址暴露。"
          action={<Link href="/login"><Button>登录 Folio</Button></Link>}
        />
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-white">
      <header className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline">{page.workspace.icon} {page.workspace.name} · 只读</span>
          <Link href={`/w/${page.workspace.id}/p/${page.id}`} className="rounded-md bg-ink px-3 py-1.5 text-white">在 Folio 中打开</Link>
        </div>
      </header>
      {page.cover ? <div className={cn("h-40", `cover-${page.cover}`)} /> : null}
      <article className="mx-auto w-full max-w-[760px] px-5 py-10">
        <div className="text-[56px] leading-none">{page.icon}</div>
        <h1 className="mt-3 text-[40px] font-bold tracking-tight">{page.title}</h1>
        <p className="mb-8 mt-2 text-xs text-faint">{page.authorName} · 编辑于 {formatDateTime(page.updatedAt)} · 公开只读</p>
        <BlockView blocks={page.blocks} />
      </article>
    </main>
  )
}
