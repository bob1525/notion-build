import { deletePage, updatePage, updatePageSchema } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

export async function PATCH(request: Request, context: { params: Promise<{ pageId: string }> }) {
  try {
    const user = await requireUser()
    const { pageId } = await context.params
    const input = updatePageSchema.parse(await readJson(request))
    const page = await updatePage(user.id, pageId, input)
    return jsonOk(page)
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ pageId: string }> }) {
  try {
    const user = await requireUser()
    const { pageId } = await context.params
    const result = await deletePage(user.id, pageId)
    return jsonOk(result)
  } catch (error) {
    return handleError(error)
  }
}
