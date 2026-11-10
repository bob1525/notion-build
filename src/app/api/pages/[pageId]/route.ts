import { deletePage, loadPageDetail, updatePage, updatePageSchema } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, HttpError, jsonOk, readJson } from "@/server/http"

export async function GET(_request: Request, context: { params: Promise<{ pageId: string }> }) {
  try {
    const user = await requireUser()
    const { pageId } = await context.params
    const loaded = await loadPageDetail(user.id, pageId)
    if (loaded.kind === "missing") throw new HttpError(404, "找不到这个页面")
    if (loaded.kind === "forbidden") throw new HttpError(403, "你没有查看这个页面的权限")
    return jsonOk(loaded.page)
  } catch (error) {
    return handleError(error)
  }
}

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
