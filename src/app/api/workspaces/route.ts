import { createWorkspace, createWorkspaceSchema } from "@/server/content"
import { requireUser } from "@/server/auth"
import { handleError, jsonOk, readJson } from "@/server/http"

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const input = createWorkspaceSchema.parse(await readJson(request))
    const workspace = await createWorkspace(user.id, input)
    return jsonOk(workspace, 201)
  } catch (error) {
    return handleError(error)
  }
}
