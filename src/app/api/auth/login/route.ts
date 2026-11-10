import { loginSchema, loginUser } from "@/server/content"
import { setSession } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await readJson(request))
    const result = await loginUser(input)
    await setSession(result.user.id)
    return jsonOk(result)
  } catch (error) {
    return handleError(error)
  }
}
