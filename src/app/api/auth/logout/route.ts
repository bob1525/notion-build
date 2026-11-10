import { clearSession } from "@/server/auth"
import { jsonOk } from "@/server/http"

export async function POST() {
  await clearSession()
  return jsonOk({ ok: true })
}
