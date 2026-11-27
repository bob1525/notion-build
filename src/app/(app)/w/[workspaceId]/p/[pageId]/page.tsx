import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { PageScreen } from "@/components/page-screen"
import { EmptyState } from "@/components/ui"
import { displayTitle } from "@/lib/format"
import { getCurrentUser } from "@/server/auth"
import { loadPageDetail } from "@/server/content"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ pageId: string }> }): Promise<Metadata> {
  const user = await getCurrentUser()
  const { pageId } = await params
  if (!user) return { title: "页面" }
  const result = await loadPageDetail(user.id, pageId)
  if (result.kind !== "ok") return { title: "页面" }
  return { title: displayTitle(result.page.title) }
}

export default async function DocumentPage({ params }: { params: Promise<{ workspaceId: string; pageId: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const { workspaceId, pageId } = await params
  const result = await loadPageDetail(user.id, pageId)
  if (result.kind === "missing" || (result.kind === "ok" && result.page.workspaceId !== workspaceId)) notFound()
  if (result.kind === "forbidden") {
    return (
      <EmptyState
        testId="forbidden"
        icon="🔒"
        title="这是一篇私有页面"
        body="只有作者本人可以打开。需要协作时，作者可以改成公开只读或公开可编辑。"
        action={<Link href={`/w/${workspaceId}`} className="rounded-md bg-ink px-3 py-2 text-sm text-white">返回工作区</Link>}
      />
    )
  }
  return <PageScreen key={result.page.id} initial={result.page} />
}
