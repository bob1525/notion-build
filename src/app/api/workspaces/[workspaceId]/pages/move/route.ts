import { movePageSchema, moveWorkspacePage } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser()
    const { workspaceId } = await context.params
    const input = movePageSchema.parse(await readJson(request))
    const pages = await moveWorkspacePage(user.id, workspaceId, input)
    return jsonOk(pages)
  } catch (error) {
    return handleError(error)
  }
}
