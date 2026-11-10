import { z } from "zod"
import { saveSidebarPreference } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

const uiSchema = z.object({
  workspaceId: z.string().trim().min(1).max(80),
  sidebar: z.record(z.string().max(80), z.boolean()),
})

export async function PUT(request: Request) {
  try {
    const user = await requireUser()
    const input = uiSchema.parse(await readJson(request))
    const sidebar = await saveSidebarPreference(user.id, input.workspaceId, input.sidebar)
    return jsonOk({ sidebar })
  } catch (error) {
    return handleError(error)
  }
}
