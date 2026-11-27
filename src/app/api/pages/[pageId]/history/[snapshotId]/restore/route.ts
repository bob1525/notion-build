import { restorePageHistory, restorePageSchema } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

export async function POST(request: Request, context: { params: Promise<{ pageId: string; snapshotId: string }> }) {
  try {
    const user = await requireUser()
    const { pageId, snapshotId } = await context.params
    const input = restorePageSchema.parse(await readJson(request))
    const response = jsonOk(await restorePageHistory(user.id, pageId, snapshotId, input))
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    return handleError(error)
  }
}
