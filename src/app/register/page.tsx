import { redirect } from "next/navigation"
import { AuthScreen } from "@/components/auth-screen"
import { getCurrentUser } from "@/server/auth"
import { getHomeWorkspaceId } from "@/server/content"

export const dynamic = "force-dynamic"

export default async function RegisterPage() {
  const user = await getCurrentUser()
  if (user) {
    const workspaceId = await getHomeWorkspaceId(user.id)
    redirect(workspaceId ? `/w/${workspaceId}` : "/start")
  }
  return <AuthScreen mode="register" />
}
