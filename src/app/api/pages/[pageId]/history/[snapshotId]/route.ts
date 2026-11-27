import { readPageHistory } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk } from "@/server/http"

export async function GET(_request: Request, context: { params: Promise<{ pageId: string; snapshotId: string }> }) {
  try {
    const user = await requireUser()
    const { pageId, snapshotId } = await context.params
    const response = jsonOk(await readPageHistory(user.id, pageId, snapshotId))
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    return handleError(error)
  }
}
