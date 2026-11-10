import { notFound, redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { WorkspaceProvider } from "@/components/workspace-provider"
import { getCurrentUser } from "@/server/auth"
import { getWorkspaceBundle } from "@/server/content"

export const dynamic = "force-dynamic"

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const { workspaceId } = await params
  const bundle = await getWorkspaceBundle(user.id, workspaceId)
  if (!bundle) notFound()
  return (
    <WorkspaceProvider
      key={bundle.workspace.id}
      user={user}
      workspace={bundle.workspace}
      workspaces={bundle.workspaces}
      pages={bundle.pages}
    >
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  )
}
