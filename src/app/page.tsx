import { redirect } from "next/navigation"
import { getCurrentUser } from "@/server/auth"
import { getHomeWorkspaceId } from "@/server/content"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const workspaceId = await getHomeWorkspaceId(user.id)
  if (!workspaceId) redirect("/start")
  redirect(`/w/${workspaceId}`)
}
