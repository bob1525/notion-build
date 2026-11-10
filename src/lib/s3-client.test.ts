import { describe, expect, it } from "vitest"
import { authorizationHeader, createS3Client } from "@/lib/s3-client"

const CREDENTIALS = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  amzDate: "20130524T000000Z",
}
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

describe("s3 signing", () => {
  it("matches the AWS GET object example", () => {
    const header = authorizationHeader({
      ...CREDENTIALS,
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      payloadHash: EMPTY_SHA256,
      headers: {
        Host: "examplebucket.s3.amazonaws.com",
        Range: "bytes=0-9",
        "x-amz-content-sha256": EMPTY_SHA256,
        "x-amz-date": "20130524T000000Z",
      },
    })
    expect(header).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    )
  })

  it("puts an object with a path-style signature", async () => {
    const calls: Array<{ url: string; method: string; headers: Headers; body: Uint8Array }> = []
    const client = createS3Client({
      endpoint: "https://account.r2.cloudflarestorage.com/prefix/",
      region: "auto",
      accessKeyId: "access",
      secretAccessKey: "secret",
      now: () => new Date("2013-05-24T00:00:00.000Z"),
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: init?.body as Uint8Array })
        return new Response(null, { status: 200 })
      },
    })
    const body = Uint8Array.from([9, 8, 7])
    await client.put({ bucket: "folio-images", key: "11111111-1111-4111-8111-111111111111.png", body, contentType: "image/png" })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe("https://account.r2.cloudflarestorage.com/prefix/folio-images/11111111-1111-4111-8111-111111111111.png")
    expect(calls[0]!.method).toBe("PUT")
    expect(calls[0]!.body).toBe(body)
    expect(calls[0]!.headers.get("content-type")).toBe("image/png")
    expect(calls[0]!.headers.get("x-amz-date")).toBe("20130524T000000Z")
    expect(calls[0]!.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=access\/20130524\/auto\/s3\/aws4_request,/)
  })

  it("deletes with an empty payload and reports a failed response", async () => {
    const methods: string[] = []
    const client = createS3Client({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "access",
      secretAccessKey: "secret",
      now: () => new Date("2013-05-24T00:00:00.000Z"),
      fetchImpl: async (_input, init) => {
        methods.push(init?.method ?? "GET")
        expect(init?.body).toBeUndefined()
        expect(new Headers(init?.headers).get("x-amz-content-sha256")).toBe(EMPTY_SHA256)
        return new Response(null, { status: methods.length === 1 ? 204 : 403 })
      },
    })
    await client.delete("folio-images", "11111111-1111-4111-8111-111111111111.png")
    await expect(client.delete("folio-images", "11111111-1111-4111-8111-111111111111.png")).rejects.toThrow("对象存储返回 403")
    expect(methods).toEqual(["DELETE", "DELETE"])
  })

  it("rejects a bucket or key that is not a single path segment", async () => {
    const client = createS3Client({ endpoint: "https://s3.example.com", region: "auto", accessKeyId: "a", secretAccessKey: "b" })
    await expect(client.put({ bucket: "../other", key: "a.png", body: new Uint8Array(), contentType: "image/png" })).rejects.toThrow("S3_BUCKET 无效")
    await expect(client.delete("folio-images", "../secret.png")).rejects.toThrow("对象键无效")
  })
})
