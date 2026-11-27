import { describe, expect, it } from "vitest"
import { filterCommands } from "@/lib/constants"
import { matchBlockShortcut } from "@/lib/shortcuts"

describe("markdown shortcuts", () => {
  it("maps the characters before a space to a block type", () => {
    expect(matchBlockShortcut("#")).toEqual({ type: "heading1", checked: false })
    expect(matchBlockShortcut("##")).toEqual({ type: "heading2", checked: false })
    expect(matchBlockShortcut("###")).toEqual({ type: "heading3", checked: false })
    expect(matchBlockShortcut("-")).toEqual({ type: "bulleted", checked: false })
    expect(matchBlockShortcut("1.")).toEqual({ type: "numbered", checked: false })
    expect(matchBlockShortcut("[]")).toEqual({ type: "todo", checked: false })
    expect(matchBlockShortcut("- [ ]")).toEqual({ type: "todo", checked: false })
    expect(matchBlockShortcut("hello")).toBeNull()
    expect(matchBlockShortcut("####")).toBeNull()
  })

  it("filters slash commands by Chinese or English keywords", () => {
    expect(filterCommands("待办").map((command) => command.type)).toEqual(["todo"])
    expect(filterCommands("code").map((command) => command.type)).toEqual(["code"])
    expect(filterCommands("").length).toBeGreaterThan(5)
  })
})
