import { redirect } from "next/navigation"
import { StartForm } from "@/components/start-form"
import { getCurrentUser } from "@/server/auth"
import { getHomeWorkspaceId } from "@/server/content"

export const dynamic = "force-dynamic"

export default async function StartPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const workspaceId = await getHomeWorkspaceId(user.id)
  if (workspaceId) redirect(`/w/${workspaceId}`)
  return <StartForm name={user.name} />
}
