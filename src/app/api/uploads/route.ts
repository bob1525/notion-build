import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { extensionForImage, imageFileError } from "@/lib/image-source"
import { requireUser } from "@/server/auth"
import { handleError, HttpError, jsonOk } from "@/server/http"

export async function POST(request: Request) {
  try {
    await requireUser()
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) throw new HttpError(400, "没有收到文件")
    const bytes = new Uint8Array(await file.arrayBuffer())
    const message = imageFileError(bytes, file.type || "", file.size)
    if (message) throw new HttpError(400, message)
    const name = `${randomUUID()}.${extensionForImage(file.type)}`
    const directory = path.join(process.cwd(), "public", "uploads")
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, name), bytes)
    return jsonOk({ url: `/uploads/${name}` })
  } catch (error) {
    return handleError(error)
  }
}
