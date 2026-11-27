import { duplicatePage, duplicatePageSchema } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

export async function POST(request: Request, context: { params: Promise<{ pageId: string }> }) {
  try {
    const user = await requireUser()
    const { pageId } = await context.params
    const input = duplicatePageSchema.parse(await readJson(request))
    const result = await duplicatePage(user.id, pageId, input.includeChildren)
    return jsonOk(result, 201)
  } catch (error) {
    return handleError(error)
  }
}
