import { listPageHistory } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk } from "@/server/http"

export async function GET(_request: Request, context: { params: Promise<{ pageId: string }> }) {
  try {
    const user = await requireUser()
    const { pageId } = await context.params
    const response = jsonOk(await listPageHistory(user.id, pageId))
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    return handleError(error)
  }
}
