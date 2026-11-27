import { listPublicPageHistory } from "@/server/content"
import { handleError, jsonOk } from "@/server/http"

export async function GET(_request: Request, context: { params: Promise<{ pageId: string }> }) {
  try {
    const { pageId } = await context.params
    const response = jsonOk(await listPublicPageHistory(pageId))
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    return handleError(error)
  }
}
