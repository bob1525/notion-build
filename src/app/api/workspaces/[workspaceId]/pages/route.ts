import { createPage, createPageSchema } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const user = await requireUser()
    const { workspaceId } = await context.params
    const input = createPageSchema.parse(await readJson(request))
    const page = await createPage(user.id, workspaceId, input)
    return jsonOk(page, 201)
  } catch (error) {
    return handleError(error)
  }
}
