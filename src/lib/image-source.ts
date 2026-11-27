import type { ImageWidth } from "@/lib/types"

const PNG = [0x89, 0x50, 0x4e, 0x47]
const JPEG = [0xff, 0xd8, 0xff]
const GIF = [0x47, 0x49, 0x46]
const WEBP = [0x52, 0x49, 0x46, 0x46]

export function imageUrlError(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return "请填写图片地址"
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return "图片地址无效"
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "图片地址无效"
  if (!url.hostname) return "图片地址无效"
  return null
}

export function imageWidthOf(value: string): ImageWidth {
  return value === "small" || value === "large" ? value : "medium"
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

export function imageFileError(bytes: Uint8Array, mime: string, size = bytes.byteLength) {
  if (!mime.startsWith("image/")) return "只能上传图片"
  if (size <= 0 || bytes.byteLength === 0) return "没有收到文件"
  if (size > 2_000_000 || bytes.byteLength > 2_000_000) return "图片不能超过 2MB"
  const valid =
    (mime === "image/png" && startsWith(bytes, PNG)) ||
    ((mime === "image/jpeg" || mime === "image/jpg") && startsWith(bytes, JPEG)) ||
    (mime === "image/gif" && startsWith(bytes, GIF)) ||
    (mime === "image/webp" && startsWith(bytes, WEBP) && bytes.length > 11 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
  if (!valid) return "文件内容不是有效图片"
  return null
}

export function extensionForImage(mime: string) {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg"
  if (mime === "image/gif") return "gif"
  if (mime === "image/webp") return "webp"
  return "png"
}
