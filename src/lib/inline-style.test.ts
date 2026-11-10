import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("italic rendering", () => {
  it("shears italic glyphs without changing their advance width", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")
    const rule = css.match(/\.inline-italic\s*\{[^}]+\}/)?.[0] ?? ""
    expect(rule).toMatch(/transform:\s*skewX\(-12deg\)/)
    expect(rule).toMatch(/font-style:\s*normal/)
    expect(rule).not.toMatch(/font-style:\s*italic/)
    expect(rule).toMatch(/display:\s*inline/)
  })
})