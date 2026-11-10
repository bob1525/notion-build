import { registerSchema, registerUser } from "@/server/content"
import { setSession } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

export async function POST(request: Request) {
  try {
    const input = registerSchema.parse(await readJson(request))
    const result = await registerUser(input)
    await setSession(result.user.id)
    return jsonOk(result, 201)
  } catch (error) {
    return handleError(error)
  }
}
