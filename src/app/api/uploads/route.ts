import { createImageStorage } from "@/lib/image-storage"
import { imageFileError } from "@/lib/image-source"
import { requireUser } from "@/server/auth"
import { handleError, HttpError, jsonOk } from "@/server/http"

function openStorage() {
  try {
    return createImageStorage()
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片存储不可用"
    throw new HttpError(500, message)
  }
}

export async function POST(request: Request) {
  try {
    await requireUser()
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) throw new HttpError(400, "没有收到文件")
    const bytes = new Uint8Array(await file.arrayBuffer())
    const message = imageFileError(bytes, file.type || "", file.size)
    if (message) throw new HttpError(400, message)
    const stored = await openStorage().upload({ bytes, contentType: file.type })
    return jsonOk({ url: stored.url })
  } catch (error) {
    return handleError(error)
  }
}
