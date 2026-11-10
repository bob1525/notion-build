import { describe, expect, it } from "vitest"
import { highlightCode } from "@/lib/highlight"

function joined(source: string, language: string) {
  return highlightCode(source, language).map((token) => token.text).join("")
}

function keywords(source: string, language: string) {
  return highlightCode(source, language).filter((token) => token.kind === "keyword").map((token) => token.text)
}

describe("code highlighting", () => {
  it("keeps every character while marking javascript keywords", () => {
    const source = "const n = 1 // note"
    expect(joined(source, "javascript")).toBe(source)
    expect(keywords(source, "javascript")).toEqual(["const"])
    expect(highlightCode(source, "typescript").some((token) => token.kind === "comment")).toBe(true)
  })

  it("marks python definitions and strings", () => {
    const source = "def greet():\n  return \"hi\""
    expect(joined(source, "python")).toBe(source)
    expect(keywords(source, "python")).toEqual(["def", "return"])
    expect(highlightCode(source, "python").some((token) => token.kind === "string" && token.text === "\"hi\"")).toBe(true)
  })

  it("marks css properties and changes when the language changes", () => {
    const source = ".title { color: red; }"
    expect(joined(source, "css")).toBe(source)
    expect(keywords(source, "css")).toEqual(["color"])
    expect(keywords(source, "javascript")).toEqual([])
    expect(keywords("const color = 1", "css")).toEqual(["color"])
    expect(keywords("const color = 1", "javascript")).toEqual(["const"])
  })
})
