import { readAccountTheme, saveAccountTheme, themePreferenceSchema } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

export async function GET() {
  try {
    const user = await requireUser()
    const response = jsonOk({ theme: await readAccountTheme(user.id) })
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    return handleError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser()
    const input = themePreferenceSchema.parse(await readJson(request))
    const response = jsonOk({ theme: await saveAccountTheme(user.id, input.theme) })
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    return handleError(error)
  }
}
