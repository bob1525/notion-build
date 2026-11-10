import { searchWorkspace } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk } from "@/server/http"

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser()
    const { workspaceId } = await context.params
    const query = new URL(request.url).searchParams.get("q") ?? ""
    const hits = await searchWorkspace(user.id, workspaceId, query)
    return jsonOk(hits)
  } catch (error) {
    return handleError(error)
  }
}
