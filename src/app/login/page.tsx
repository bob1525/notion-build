import { redirect } from "next/navigation"
import { AuthScreen } from "@/components/auth-screen"
import { safeNextPath } from "@/lib/format"
import { getCurrentUser } from "@/server/auth"
import { getHomeWorkspaceId } from "@/server/content"

export const dynamic = "force-dynamic"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser()
  const params = await searchParams
  if (user) {
    const workspaceId = await getHomeWorkspaceId(user.id)
    redirect(safeNextPath(params.next, workspaceId ? `/w/${workspaceId}` : "/start"))
  }
  return <AuthScreen mode="login" />
}
