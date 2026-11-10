import type { Metadata } from "next"
import { WorkspaceHome } from "@/components/workspace-home"
import { getCurrentUser } from "@/server/auth"
import { getWorkspaceBundle } from "@/server/content"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ workspaceId: string }> }): Promise<Metadata> {
  const user = await getCurrentUser()
  const { workspaceId } = await params
  if (!user) return { title: "工作区" }
  const bundle = await getWorkspaceBundle(user.id, workspaceId)
  return { title: bundle?.workspace.name ?? "工作区" }
}

export default function WorkspacePage() {
  return <WorkspaceHome />
}
