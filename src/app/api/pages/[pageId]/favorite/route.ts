import { z } from "zod"
import { setFavorite } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

const favoriteSchema = z.object({ favorited: z.boolean() })

export async function POST(request: Request, context: { params: Promise<{ pageId: string }> }) {
  try {
    const user = await requireUser()
    const { pageId } = await context.params
    const input = favoriteSchema.parse(await readJson(request))
    const page = await setFavorite(user.id, pageId, input.favorited)
    return jsonOk(page)
  } catch (error) {
    return handleError(error)
  }
}
