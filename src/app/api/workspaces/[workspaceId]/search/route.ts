import { searchWorkspace } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk } from "@/server/http"

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser()
    const { workspaceId } = await context.params
    const url = new URL(request.url)
    const query = url.searchParams.get("q") ?? ""
    const scopeParam = url.searchParams.get("scope")
    const scope = scopeParam === "title" || scopeParam === "content" ? scopeParam : "all"
    const hits = await searchWorkspace(user.id, workspaceId, query, scope)
    return jsonOk(hits)
  } catch (error) {
    return handleError(error)
  }
}
