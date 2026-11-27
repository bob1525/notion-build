import { createHash, createHmac } from "node:crypto"

export type ObjectPut = {
  bucket: string
  key: string
  body: Uint8Array
  contentType: string
}

export interface ObjectStorageClient {
  put(object: ObjectPut): Promise<void>
  delete(bucket: string, key: string): Promise<void>
}

export type S3ClientOptions = {
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  fetchImpl?: typeof fetch
  now?: () => Date
}

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

function sha256Hex(data: Uint8Array | string) {
  return createHash("sha256").update(data).digest("hex")
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data, "utf8").digest()
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function encodePath(pathname: string) {
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

export function authorizationHeader(input: {
  method: string
  url: URL
  headers: Record<string, string>
  payloadHash: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  amzDate: string
}) {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(input.headers)) headers[name.toLowerCase()] = value
  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]!.trim().replace(/ +/g, " ")}\n`).join("")
  const signedHeaders = names.join(";")
  const canonical = [input.method.toUpperCase(), encodePath(input.url.pathname) || "/", "", canonicalHeaders, signedHeaders, input.payloadHash].join("\n")
  const dateStamp = input.amzDate.slice(0, 8)
  const scope = `${dateStamp}/${input.region}/s3/aws4_request`
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, sha256Hex(canonical)].join("\n")
  const signature = createHmac("sha256", hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), "s3"), "aws4_request"))
    .update(stringToSign)
    .digest("hex")
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`
}

function objectUrl(endpoint: string, bucket: string, key: string) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..")) throw new Error("S3_BUCKET 无效")
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(key) || key.includes("..")) throw new Error("对象键无效")
  const url = new URL(endpoint)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("S3_ENDPOINT 无效")
  const prefix = url.pathname.replace(/\/+$/, "")
  url.pathname = `${prefix}/${bucket}/${key}`
  url.search = ""
  url.hash = ""
  return url
}

async function send(options: S3ClientOptions, method: "PUT" | "DELETE", url: URL, body: Uint8Array, contentType?: string) {
  const amzDate = amzTimestamp((options.now ?? (() => new Date()))())
  const payloadHash = body.byteLength === 0 ? EMPTY_SHA256 : sha256Hex(body)
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  }
  if (contentType) headers["content-type"] = contentType
  const authorization = authorizationHeader({
    method,
    url,
    headers,
    payloadHash,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    region: options.region,
    amzDate,
  })
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(url, {
    method,
    headers: { ...headers, authorization },
    body: method === "PUT" ? (body as unknown as BodyInit) : undefined,
  })
  if (!response.ok) throw new Error(`对象存储返回 ${response.status}`)
}

export function createS3Client(options: S3ClientOptions): ObjectStorageClient {
  return {
    async put(object) {
      const url = objectUrl(options.endpoint, object.bucket, object.key)
      await send(options, "PUT", url, object.body, object.contentType)
    },
    async delete(bucket, key) {
      const url = objectUrl(options.endpoint, bucket, key)
      await send(options, "DELETE", url, new Uint8Array())
    },
  }
}
