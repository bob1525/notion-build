import { readPublicPageHistory } from "@/server/content"
import { handleError, jsonOk } from "@/server/http"

export async function GET(_request: Request, context: { params: Promise<{ pageId: string; snapshotId: string }> }) {
  try {
    const { pageId, snapshotId } = await context.params
    const response = jsonOk(await readPublicPageHistory(pageId, snapshotId))
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    return handleError(error)
  }
}
