import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createImageStorage, createLocalImageStorage, type StorageEnv } from "@/lib/image-storage"
import type { ObjectPut, ObjectStorageClient } from "@/lib/s3-client"

const PNG = Uint8Array.from([1, 2, 3, 4])
const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function tempDir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "folio-images-"))
  directories.push(directory)
  return directory
}

function s3Env(overrides: StorageEnv = {}): StorageEnv {
  return {
    IMAGE_STORAGE: "s3",
    S3_BUCKET: "folio-images",
    S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
    S3_ACCESS_KEY_ID: "access",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_PUBLIC_BASE_URL: "https://images.example.com/",
    ...overrides,
  }
}

function mockClient() {
  const puts: ObjectPut[] = []
  const deletes: Array<{ bucket: string; key: string }> = []
  const client: ObjectStorageClient = {
    async put(object) {
      puts.push(object)
    },
    async delete(bucket, key) {
      deletes.push({ bucket, key })
    },
  }
  return { client, puts, deletes }
}

describe("local image storage", () => {
  it("writes the bytes under public/uploads and returns that url", async () => {
    const storage = createLocalImageStorage(await tempDir())
    const stored = await storage.upload({ bytes: PNG, contentType: "image/jpeg" })
    expect(stored.key).toMatch(/^[0-9a-f-]{36}\.jpg$/)
    expect(stored.url).toBe(`/uploads/${stored.key}`)
    expect(storage.getUrl(stored.key)).toBe(stored.url)
    const directory = directories[0]!
    expect(await readFile(path.join(directory, stored.key))).toEqual(Buffer.from(PNG))
  })

  it("deletes a stored file and ignores a second delete", async () => {
    const directory = await tempDir()
    const storage = createLocalImageStorage(directory)
    const stored = await storage.upload({ bytes: PNG, contentType: "image/png" })
    await storage.delete(stored.key)
    await expect(stat(path.join(directory, stored.key))).rejects.toMatchObject({ code: "ENOENT" })
    await expect(storage.delete(stored.key)).resolves.toBeUndefined()
  })

  it("rejects keys that leave the upload directory", async () => {
    const storage = createLocalImageStorage(await tempDir())
    for (const key of ["../secret.png", "nested/a.png", "", "not-a-uuid.png"]) {
      expect(() => storage.getUrl(key)).toThrow("图片标识无效")
      await expect(storage.delete(key)).rejects.toThrow("图片标识无效")
    }
  })
})

describe("image storage selection", () => {
  it("uses the local directory when the backend is unset or local", async () => {
    const directory = await tempDir()
    for (const env of [{}, { IMAGE_STORAGE: "" }, { IMAGE_STORAGE: " LOCAL " }]) {
      const storage = createImageStorage(env, { directory })
      const stored = await storage.upload({ bytes: PNG, contentType: "image/png" })
      expect(stored.url).toBe(`/uploads/${stored.key}`)
    }
  })

  it("uploads to the object store and publishes the public url", async () => {
    const { client, puts } = mockClient()
    const storage = createImageStorage(s3Env(), { client })
    const stored = await storage.upload({ bytes: PNG, contentType: "image/webp" })
    expect(puts).toEqual([{ bucket: "folio-images", key: stored.key, body: PNG, contentType: "image/webp" }])
    expect(stored.key).toMatch(/\.webp$/)
    expect(stored.url).toBe(`https://images.example.com/${stored.key}`)
    expect(storage.getUrl(stored.key)).toBe(stored.url)
  })

  it("deletes through the object store", async () => {
    const { client, deletes } = mockClient()
    const storage = createImageStorage(s3Env(), { client })
    const key = "11111111-1111-4111-8111-111111111111.png"
    await storage.delete(key)
    expect(deletes).toEqual([{ bucket: "folio-images", key }])
  })

  it("names every missing object-storage setting", () => {
    expect(() => createImageStorage({ IMAGE_STORAGE: "s3", S3_BUCKET: "folio-images" })).toThrow("缺少 S3_ENDPOINT、S3_ACCESS_KEY_ID、S3_SECRET_ACCESS_KEY、S3_PUBLIC_BASE_URL")
  })

  it("rejects an unknown backend and a bad public url", () => {
    expect(() => createImageStorage({ IMAGE_STORAGE: "gcs" })).toThrow("未知的图片存储：gcs")
    const { client } = mockClient()
    expect(() => createImageStorage(s3Env({ S3_PUBLIC_BASE_URL: "ftp://images.example.com" }), { client })).toThrow("S3_PUBLIC_BASE_URL 无效")
  })
})
