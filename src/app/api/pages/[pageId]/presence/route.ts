import { z } from "zod"
import { touchPresence } from "@/server/presence"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

const presenceSchema = z.object({
  activity: z.enum(["viewing", "editing", "leave"]),
})

export async function POST(request: Request, context: { params: Promise<{ pageId: string }> }) {
  try {
    const user = await requireUser()
    const { pageId } = await context.params
    const input = presenceSchema.parse(await readJson(request))
    const response = jsonOk(await touchPresence(user.id, pageId, input.activity))
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    return handleError(error)
  }
}
