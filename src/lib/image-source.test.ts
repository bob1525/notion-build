import { describe, expect, it } from "vitest"
import { imageFileError, imageUrlError } from "@/lib/image-source"

const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"))

describe("image sources", () => {
  it("accepts http and https urls", () => {
    expect(imageUrlError("https://example.com/a.png")).toBeNull()
    expect(imageUrlError("http://images.example/a.jpg")).toBeNull()
  })

  it("rejects an invalid url", () => {
    expect(imageUrlError("notaurl")).toBe("图片地址无效")
    expect(imageUrlError("ftp://files.example/a.png")).toBe("图片地址无效")
    expect(imageUrlError("")).toBe("请填写图片地址")
  })

  it("accepts a real png and rejects a text file or a fake image", () => {
    expect(imageFileError(PNG, "image/png")).toBeNull()
    expect(imageFileError(Uint8Array.from([1, 2, 3]), "text/plain")).toBe("只能上传图片")
    expect(imageFileError(Uint8Array.from([1, 2, 3, 4]), "image/png")).toBe("文件内容不是有效图片")
  })
})
