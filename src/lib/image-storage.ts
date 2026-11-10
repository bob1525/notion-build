import { randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { extensionForImage } from "@/lib/image-source"
import { createS3Client, type ObjectStorageClient } from "@/lib/s3-client"

export type StoredImage = {
  key: string
  url: string
}

export interface ImageStorage {
  upload(file: { bytes: Uint8Array; contentType: string }): Promise<StoredImage>
  getUrl(key: string): string
  delete(key: string): Promise<void>
}

const IMAGE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/i

export function assertImageKey(key: string) {
  if (!IMAGE_KEY.test(key)) throw new Error("图片标识无效")
  return key
}

export function defaultUploadsDirectory() {
  return path.join(process.cwd(), "public", "uploads")
}

export function createLocalImageStorage(directory = defaultUploadsDirectory()): ImageStorage {
  return {
    async upload(file) {
      const key = `${randomUUID()}.${extensionForImage(file.contentType)}`
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, key), file.bytes)
      return { key, url: publicPath(key) }
    },
    getUrl(key) {
      return publicPath(assertImageKey(key))
    },
    async delete(key) {
      const safe = assertImageKey(key)
      await unlink(path.join(directory, safe)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error
      })
    },
  }
}

function publicPath(key: string) {
  return `/uploads/${key}`
}

export function createS3ImageStorage(options: { bucket: string; publicBaseUrl: string; client: ObjectStorageClient }): ImageStorage {
  const base = publicBase(options.publicBaseUrl)
  return {
    async upload(file) {
      const key = `${randomUUID()}.${extensionForImage(file.contentType)}`
      await options.client.put({ bucket: options.bucket, key, body: file.bytes, contentType: file.contentType || "application/octet-stream" })
      return { key, url: objectUrl(base, key) }
    },
    getUrl(key) {
      return objectUrl(base, assertImageKey(key))
    },
    async delete(key) {
      await options.client.delete(options.bucket, assertImageKey(key))
    },
  }
}

function publicBase(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("S3_PUBLIC_BASE_URL 无效")
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.search || url.hash) throw new Error("S3_PUBLIC_BASE_URL 无效")
  return url.toString().replace(/\/$/, "")
}

function objectUrl(base: string, key: string) {
  return `${base}/${key}`
}

const S3_SETTINGS = ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL"] as const

export type StorageEnv = {
  [key: string]: string | undefined
  IMAGE_STORAGE?: string
  S3_BUCKET?: string
  S3_ENDPOINT?: string
  S3_REGION?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  S3_PUBLIC_BASE_URL?: string
}

export function createImageStorage(env: StorageEnv = process.env, options?: { directory?: string; client?: ObjectStorageClient }): ImageStorage {
  const backend = (env.IMAGE_STORAGE ?? "local").trim().toLowerCase() || "local"
  if (backend === "local") return createLocalImageStorage(options?.directory)
  if (backend === "s3") {
    const missing = S3_SETTINGS.filter((name) => !env[name]?.trim())
    if (missing.length > 0) throw new Error(`对象存储还没配好：缺少 ${missing.join("、")}`)
    const client =
      options?.client ??
      createS3Client({
        endpoint: env.S3_ENDPOINT!.trim(),
        region: env.S3_REGION?.trim() || "auto",
        accessKeyId: env.S3_ACCESS_KEY_ID!.trim(),
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!.trim(),
      })
    return createS3ImageStorage({ bucket: env.S3_BUCKET!.trim(), publicBaseUrl: env.S3_PUBLIC_BASE_URL!.trim(), client })
  }
  throw new Error(`未知的图片存储：${backend}`)
}
