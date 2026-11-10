import { describe, expect, it } from "vitest"
import {
  applyTextChange,
  consumeInlineMarkup,
  mapCaret,
  parseInlineMarkup,
  renderInline,
  serializeInlineMarkup,
  toggleInlineMark,
} from "@/lib/rich-text"

describe("inline rich text", () => {
  it("parses bold, italic, strike, and inline code", () => {
    expect(parseInlineMarkup("**粗体**")).toEqual({ text: "粗体", marks: [{ type: "bold", start: 0, end: 2 }] })
    expect(parseInlineMarkup("*斜体*")).toEqual({ text: "斜体", marks: [{ type: "italic", start: 0, end: 2 }] })
    expect(parseInlineMarkup("~~删除~~")).toEqual({ text: "删除", marks: [{ type: "strike", start: 0, end: 2 }] })
    expect(parseInlineMarkup("`code`")).toEqual({ text: "code", marks: [{ type: "code", start: 0, end: 4 }] })
  })

  it("renders nested bold and italic as layered segments", () => {
    const parsed = parseInlineMarkup("**粗 *斜* 体**")
    expect(parsed.text).toBe("粗 斜 体")
    expect(renderInline(parsed.text, parsed.marks)).toEqual([
      { text: "粗 ", marks: ["bold"] },
      { text: "斜", marks: ["bold", "italic"] },
      { text: " 体", marks: ["bold"] },
    ])
  })

  it("keeps markers inside inline code opaque", () => {
    const parsed = parseInlineMarkup("`a **b**`")
    expect(parsed.text).toBe("a **b**")
    expect(parsed.marks).toEqual([{ type: "code", start: 0, end: parsed.text.length }])
    expect(renderInline(parsed.text, parsed.marks)).toEqual([{ text: "a **b**", marks: ["code"] }])
  })

  it("applies a mark to the middle of a block and can cancel it", () => {
    const applied = toggleInlineMark("你好世界", [], 2, 4, "bold")
    expect(applied).toEqual([{ type: "bold", start: 2, end: 4 }])
    expect(renderInline("你好世界", applied)).toEqual([
      { text: "你好", marks: [] },
      { text: "世界", marks: ["bold"] },
    ])
    expect(toggleInlineMark("你好世界", applied, 2, 4, "bold")).toEqual([])
  })

  it("cancels only the selected part of a longer mark", () => {
    const all = toggleInlineMark("你好世界", [], 0, 4, "italic")
    expect(toggleInlineMark("你好世界", all, 1, 3, "italic")).toEqual([
      { type: "italic", start: 0, end: 1 },
      { type: "italic", start: 3, end: 4 },
    ])
  })

  it("nests a second mark without dropping the first", () => {
    const bold = toggleInlineMark("你好世界", [], 0, 4, "bold")
    const nested = toggleInlineMark("你好世界", bold, 1, 3, "strike")
    expect(renderInline("你好世界", nested)).toEqual([
      { text: "你", marks: ["bold"] },
      { text: "好世", marks: ["bold", "strike"] },
      { text: "界", marks: ["bold"] },
    ])
  })

  it("shifts marks when text is inserted and removed", () => {
    const bold = [{ type: "bold" as const, start: 1, end: 3 }]
    expect(applyTextChange("abcd", bold, "Xabcd").marks).toEqual([{ type: "bold", start: 2, end: 4 }])
    expect(applyTextChange("abcd", bold, "ad").marks).toEqual([])
    expect(applyTextChange("abcd", bold, "abXcd", ["italic"]).marks).toEqual([
      { type: "bold", start: 1, end: 2 },
      { type: "italic", start: 2, end: 3 },
      { type: "bold", start: 3, end: 4 },
    ])
  })

  it("turns typed markup into marks and moves the caret", () => {
    const consumed = consumeInlineMarkup("前**粗体**后", [])
    expect(consumed.text).toBe("前粗体后")
    expect(consumed.marks).toEqual([{ type: "bold", start: 1, end: 3 }])
    expect(mapCaret(consumed.map, "前**粗体**后".length)).toBe("前粗体后".length)
    expect(serializeInlineMarkup(consumed.text, consumed.marks)).toBe("前**粗体**后")
  })

  it("round-trips nested markup through the serializer", () => {
    const source = "**粗 *斜* ~~删除~~** `code`"
    const parsed = parseInlineMarkup(source)
    const again = parseInlineMarkup(serializeInlineMarkup(parsed.text, parsed.marks))
    expect(again).toEqual({ text: parsed.text, marks: parsed.marks })
  })
})
