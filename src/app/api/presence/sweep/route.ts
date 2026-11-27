import { sweepExpiredPresence } from "@/server/presence-sweep"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk } from "@/server/http"

export async function POST() {
  try {
    await requireUser()
    const deleted = await sweepExpiredPresence()
    const response = jsonOk({ deleted })
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    return handleError(error)
  }
}
