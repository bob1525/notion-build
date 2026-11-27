import { INLINE_MARKS, type InlineMark, type InlineMarkType } from "@/lib/types"

export type InlineSegment = {
  text: string
  marks: InlineMarkType[]
  href?: string
}

type MarkupToken = {
  type: InlineMarkType
  token: string
  opaque: boolean
}

const TOKENS: MarkupToken[] = [
  { type: "code", token: "`", opaque: true },
  { type: "strike", token: "~~", opaque: false },
  { type: "bold", token: "**", opaque: false },
  { type: "italic", token: "*", opaque: false },
]

export function sanitizeLinkHref(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 2000) return null
  if (/[\u0000-\u001F\u007F]/.test(trimmed) || /\s/.test(trimmed)) return null
  let decoded = trimmed
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    return null
  }
  if (/^\s*javascript\s*:/i.test(decoded) || /^\s*javascript\s*:/i.test(trimmed)) return null
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.username || url.password) return null
  return url.href
}

export function normalizeMarks(text: string, marks: InlineMark[]): InlineMark[] {
  const length = text.length
  const clean: InlineMark[] = []
  for (const mark of marks) {
    if (!INLINE_MARKS.includes(mark.type)) continue
    const start = clamp(Math.floor(mark.start), 0, length)
    const end = clamp(Math.floor(mark.end), 0, length)
    if (end <= start) continue
    if (mark.type === "link") {
      const href = sanitizeLinkHref(mark.href ?? "")
      if (!href) continue
      clean.push({ type: "link", start, end, href })
      continue
    }
    clean.push({ type: mark.type, start, end })
  }

  const merged: InlineMark[] = []
  for (const type of INLINE_MARKS) {
    const groups = new Map<string, Array<[number, number]>>()
    for (const mark of clean) {
      if (mark.type !== type) continue
      const key = type === "link" ? mark.href ?? "" : ""
      const ranges = groups.get(key) ?? []
      ranges.push([mark.start, mark.end])
      groups.set(key, ranges)
    }
    for (const [href, ranges] of groups) {
      ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
      let current: [number, number] | null = null
      for (const range of ranges) {
        if (!current || range[0] > current[1]) {
          if (current) merged.push(styledMark(type, current[0], current[1], href))
          current = [range[0], range[1]]
        } else {
          current = [current[0], Math.max(current[1], range[1])]
        }
      }
      if (current) merged.push(styledMark(type, current[0], current[1], href))
    }
  }
  return merged.sort((a, b) => a.start - b.start || a.end - b.end || a.type.localeCompare(b.type))
}

export function renderInline(text: string, marks: InlineMark[]): InlineSegment[] {
  const normalized = normalizeMarks(text, marks)
  if (!text) return []
  const points = new Set<number>([0, text.length])
  for (const mark of normalized) {
    points.add(mark.start)
    points.add(mark.end)
  }
  const cuts = [...points].sort((a, b) => a - b)
  const segments: InlineSegment[] = []
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const start = cuts[index]
    const end = cuts[index + 1]
    if (end <= start) continue
    const active = INLINE_MARKS.filter((type) =>
      normalized.some((mark) => mark.type === type && mark.start <= start && mark.end >= end),
    )
    const href = linkHref(normalized, start, end)
    const slice = text.slice(start, end)
    const previous = segments[segments.length - 1]
    if (previous && sameMarks(previous.marks, active) && (previous.href ?? "") === (href ?? "")) previous.text += slice
    else segments.push(href ? { text: slice, marks: active, href } : { text: slice, marks: active })
  }
  return segments
}

export function toggleInlineMark(text: string, marks: InlineMark[], start: number, end: number, type: InlineMarkType) {
  const from = clamp(Math.min(start, end), 0, text.length)
  const to = clamp(Math.max(start, end), 0, text.length)
  const normalized = normalizeMarks(text, marks)
  if (from === to) return normalized
  if (coveredLength(normalized, type, from, to) === to - from) {
    const next: InlineMark[] = []
    for (const mark of normalized) {
      if (mark.type !== type || mark.end <= from || mark.start >= to) {
        next.push(mark)
        continue
      }
      if (mark.start < from) {
        const left = clipMark(mark, mark.start, from)
        if (left) next.push(left)
      }
      if (mark.end > to) {
        const right = clipMark(mark, to, mark.end)
        if (right) next.push(right)
      }
    }
    return normalizeMarks(text, next)
  }
  return normalizeMarks(text, [...normalized, { type, start: from, end: to }])
}

export function setInlineLink(text: string, marks: InlineMark[], start: number, end: number, href: string) {
  const safe = sanitizeLinkHref(href)
  const from = clamp(Math.min(start, end), 0, text.length)
  const to = clamp(Math.max(start, end), 0, text.length)
  if (!safe || from === to) return null
  return normalizeMarks(text, [...withoutLinkRange(text, marks, from, to), { type: "link", start: from, end: to, href: safe }])
}

export function clearInlineLink(text: string, marks: InlineMark[], start: number, end: number) {
  const from = clamp(Math.min(start, end), 0, text.length)
  const to = clamp(Math.max(start, end), 0, text.length)
  return normalizeMarks(text, withoutLinkRange(text, marks, from, to))
}

export function linkCovering(marks: InlineMark[], start: number, end: number) {
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  if (from === to) return marks.find((mark) => mark.type === "link" && mark.href && from > mark.start && from <= mark.end) ?? null
  return marks.find((mark) => mark.type === "link" && mark.href && mark.start <= from && mark.end >= to) ?? null
}

export function marksAtCaret(marks: InlineMark[], caret: number): InlineMarkType[] {
  return INLINE_MARKS.filter((type) =>
    marks.some((mark) => mark.type === type && caret > mark.start && caret <= mark.end),
  )
}

export function marksCovering(marks: InlineMark[], start: number, end: number): InlineMarkType[] {
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  if (from === to) return marksAtCaret(marks, from)
  return INLINE_MARKS.filter((type) => coveredLength(marks, type, from, to) === to - from)
}

export function applyTextChange(previous: string, marks: InlineMark[], next: string, typing: InlineMarkType[] = []) {
  if (previous === next) return { text: next, marks: normalizeMarks(next, marks) }
  let prefix = 0
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const deletedEnd = previous.length - suffix
  const insertedEnd = next.length - suffix
  const shift = insertedEnd - deletedEnd
  const result: InlineMark[] = []
  for (const mark of normalizeMarks(previous, marks)) {
    if (mark.end <= prefix) {
      result.push(mark)
      continue
    }
    if (mark.start >= deletedEnd) {
      const moved = clipMark(mark, mark.start + shift, mark.end + shift)
      if (moved) result.push(moved)
      continue
    }
    if (mark.start < prefix) {
      const left = clipMark(mark, mark.start, prefix)
      if (left) result.push(left)
    }
    if (mark.end > deletedEnd) {
      const right = clipMark(mark, insertedEnd, mark.end + shift)
      if (right) result.push(right)
    }
  }
  if (insertedEnd > prefix) {
    for (const type of typing) result.push({ type, start: prefix, end: insertedEnd })
  }
  return { text: next, marks: normalizeMarks(next, result) }
}

export function parseInlineMarkup(input: string) {
  const parsed = parseRange(input, 0, input.length)
  return { text: parsed.text, marks: normalizeMarks(parsed.text, parsed.marks) }
}

const MARK_ORDER: InlineMarkType[] = ["bold", "italic", "strike", "code"]

export function serializeInlineMarkup(text: string, marks: InlineMark[]) {
  const normalized = normalizeMarks(text, marks)
  const links = normalized.filter((mark) => mark.type === "link")
  if (!links.length) return serializeStyled(text, normalized)
  let out = ""
  let cursor = 0
  for (const link of links) {
    if (link.start < cursor) continue
    if (link.start > cursor) out += serializeStyled(text.slice(cursor, link.start), sliceStyle(normalized, cursor, link.start))
    out += `[${serializeStyled(text.slice(link.start, link.end), sliceStyle(normalized, link.start, link.end))}](${markdownDestination(link.href ?? "")})`
    cursor = link.end
  }
  if (cursor < text.length) out += serializeStyled(text.slice(cursor), sliceStyle(normalized, cursor, text.length))
  return out
}

function serializeStyled(text: string, marks: InlineMark[]) {
  let out = ""
  let open: InlineMarkType[] = []
  const segments = renderInline(text, marks)
  for (const segment of segments) {
    const next = MARK_ORDER.filter((type) => segment.marks.includes(type))
    let shared = 0
    while (shared < open.length && shared < next.length && open[shared] === next[shared]) shared += 1
    for (let index = open.length - 1; index >= shared; index -= 1) out += tokenFor(open[index])
    for (let index = shared; index < next.length; index += 1) out += tokenFor(next[index])
    out += segment.text
    open = next
  }
  for (let index = open.length - 1; index >= 0; index -= 1) out += tokenFor(open[index])
  return out
}

function tokenFor(type: InlineMarkType) {
  return TOKENS.find((item) => item.type === type)?.token ?? ""
}

export function consumeInlineMarkup(text: string, marks: InlineMark[]) {
  const identity = [...text].map((_, index) => index)
  if (!/[*`~\[]/.test(text)) return { text, marks: normalizeMarks(text, marks), map: identity }
  const parsed = parseRange(text, 0, text.length)
  if (parsed.text === text) return { text, marks: normalizeMarks(text, marks), map: parsed.map }
  const remapped = remapMarks(marks, parsed.map)
  return {
    text: parsed.text,
    marks: normalizeMarks(parsed.text, [...remapped, ...parsed.marks]),
    map: parsed.map,
  }
}

export function mapCaret(map: number[], caret: number) {
  let index = 0
  while (index < map.length && map[index] < caret) index += 1
  return index
}

export function splitInlineContent(text: string, marks: InlineMark[], start: number, end: number) {
  const from = clamp(Math.min(start, end), 0, text.length)
  const to = clamp(Math.max(start, end), 0, text.length)
  const beforeText = text.slice(0, from)
  const afterText = text.slice(to)
  const before: InlineMark[] = []
  const after: InlineMark[] = []
  for (const mark of normalizeMarks(text, marks)) {
    if (mark.start < from) {
      const left = clipMark(mark, mark.start, Math.min(mark.end, from))
      if (left) before.push(left)
    }
    if (mark.end > to) {
      const right = clipMark(mark, Math.max(mark.start, to) - to, mark.end - to)
      if (right) after.push(right)
    }
  }
  return {
    beforeText,
    afterText,
    beforeMarks: normalizeMarks(beforeText, before),
    afterMarks: normalizeMarks(afterText, after),
  }
}

export function concatInline(leftText: string, leftMarks: InlineMark[], rightText: string, rightMarks: InlineMark[]) {
  const text = leftText + rightText
  const shifted = rightMarks.flatMap((mark) => {
    const next = clipMark(mark, mark.start + leftText.length, mark.end + leftText.length)
    return next ? [next] : []
  })
  return { text, marks: normalizeMarks(text, [...leftMarks, ...shifted]) }
}

function parseRange(input: string, start: number, end: number): { text: string; marks: InlineMark[]; map: number[] } {
  let text = ""
  const marks: InlineMark[] = []
  const map: number[] = []
  let index = start
  while (index < end) {
    const opener = earliestOpener(input, index, end)
    const link = nextLink(input, index, end)
    if (link && (!opener || link.index <= opener.index)) {
      if (link.index > index) {
        appendLiteral(input, index, link.index, text, map)
        text += input.slice(index, link.index)
      }
      const inner = parseRange(input, link.labelStart, link.labelEnd)
      const at = text.length
      text += inner.text
      map.push(...inner.map)
      for (const mark of inner.marks) {
        const shifted = clipMark(mark, at + mark.start, at + mark.end)
        if (shifted) marks.push(shifted)
      }
      marks.push({ type: "link", start: at, end: at + inner.text.length, href: link.href })
      index = link.end
      continue
    }
    if (!opener) {
      appendLiteral(input, index, end, text, map)
      text += input.slice(index, end)
      break
    }
    if (opener.index > index) {
      appendLiteral(input, index, opener.index, text, map)
      text += input.slice(index, opener.index)
    }
    const innerFrom = opener.index + opener.token.length
    const closeAt = findClose(input, innerFrom, end, opener.token)
    if (closeAt < 0) {
      appendLiteral(input, opener.index, opener.index + 1, text, map)
      text += input[opener.index]
      index = opener.index + 1
      continue
    }
    const inner = opener.opaque
      ? { text: input.slice(innerFrom, closeAt), marks: [] as InlineMark[], map: indexes(innerFrom, closeAt) }
      : parseRange(input, innerFrom, closeAt)
    if (!inner.text || inner.text !== inner.text.trim()) {
      appendLiteral(input, opener.index, opener.index + 1, text, map)
      text += input[opener.index]
      index = opener.index + 1
      continue
    }
    const at = text.length
    text += inner.text
    map.push(...inner.map)
    for (const mark of inner.marks) {
      const shifted = clipMark(mark, at + mark.start, at + mark.end)
      if (shifted) marks.push(shifted)
    }
    marks.push({ type: opener.type, start: at, end: at + inner.text.length })
    index = closeAt + opener.token.length
  }
  return { text, marks, map }
}

function earliestOpener(input: string, from: number, end: number) {
  let found: { index: number; type: InlineMarkType; token: string; opaque: boolean } | null = null
  for (let index = from; index < end; index += 1) {
    for (const token of TOKENS) {
      if (!delimiterAt(input, index, token.token)) continue
      if (!found || index < found.index) found = { index, type: token.type, token: token.token, opaque: token.opaque }
      break
    }
    if (found?.index === index) break
  }
  return found
}

function findClose(input: string, from: number, end: number, token: string) {
  let index = from
  while (index < end) {
    if ((token === "*" && input.startsWith("**", index)) || (token === "`" && input.startsWith("``", index))) {
      index += 2
      continue
    }
    if (delimiterAt(input, index, token)) return index
    index += 1
  }
  return -1
}

function delimiterAt(input: string, index: number, token: string) {
  if (!input.startsWith(token, index)) return false
  if (token === "*" && input.startsWith("**", index)) return false
  if (token === "`" && input.startsWith("``", index)) return false
  return true
}

function remapMarks(marks: InlineMark[], map: number[]) {
  const next: InlineMark[] = []
  for (const mark of marks) {
    let start = -1
    let end = -1
    for (let index = 0; index < map.length; index += 1) {
      if (map[index] >= mark.start && map[index] < mark.end) {
        if (start < 0) start = index
        end = index + 1
      }
    }
    if (start >= 0 && end > start) {
      const shifted = clipMark(mark, start, end)
      if (shifted) next.push(shifted)
    }
  }
  return next
}

function coveredLength(marks: InlineMark[], type: InlineMarkType, from: number, to: number) {
  const ranges = marks
    .filter((mark) => mark.type === type)
    .map((mark) => [Math.max(mark.start, from), Math.min(mark.end, to)] as [number, number])
    .filter((range) => range[1] > range[0])
    .sort((a, b) => a[0] - b[0])
  let cursor = from
  let total = 0
  for (const range of ranges) {
    const start = Math.max(range[0], cursor)
    if (range[1] > start) {
      total += range[1] - start
      cursor = range[1]
    }
  }
  return total
}

function appendLiteral(input: string, from: number, to: number, text: string, map: number[]) {
  void text
  for (let index = from; index < to; index += 1) map.push(index)
  void input
}

function indexes(from: number, to: number) {
  const map: number[] = []
  for (let index = from; index < to; index += 1) map.push(index)
  return map
}

function sameMarks(left: InlineMarkType[], right: InlineMarkType[]) {
  return left.length === right.length && left.every((mark, index) => mark === right[index])
}

function styledMark(type: InlineMarkType, start: number, end: number, href: string): InlineMark {
  if (type === "link") return { type, start, end, href }
  return { type, start, end }
}

function clipMark(mark: InlineMark, start: number, end: number): InlineMark | null {
  if (end <= start) return null
  if (mark.type === "link") {
    if (!mark.href) return null
    return { type: "link", start, end, href: mark.href }
  }
  return { type: mark.type, start, end }
}

function withoutLinkRange(text: string, marks: InlineMark[], from: number, to: number) {
  const next: InlineMark[] = []
  for (const mark of normalizeMarks(text, marks)) {
    if (mark.type !== "link" || mark.end <= from || mark.start >= to) {
      next.push(mark)
      continue
    }
    if (mark.start < from) {
      const left = clipMark(mark, mark.start, from)
      if (left) next.push(left)
    }
    if (mark.end > to) {
      const right = clipMark(mark, to, mark.end)
      if (right) next.push(right)
    }
  }
  return next
}

function linkHref(marks: InlineMark[], start: number, end: number) {
  let chosen: InlineMark | null = null
  for (const mark of marks) {
    if (mark.type !== "link" || !mark.href) continue
    if (mark.start <= start && mark.end >= end && (!chosen || mark.start >= chosen.start)) chosen = mark
  }
  return chosen?.href
}

function sliceStyle(marks: InlineMark[], from: number, to: number) {
  const out: InlineMark[] = []
  for (const mark of marks) {
    if (mark.type === "link") continue
    const start = Math.max(mark.start, from) - from
    const end = Math.min(mark.end, to) - from
    if (end > start) out.push({ type: mark.type, start, end })
  }
  return out
}

function markdownDestination(href: string) {
  return href.replaceAll("(", "%28").replaceAll(")", "%29")
}

function nextLink(input: string, from: number, end: number) {
  let index = input.indexOf("[", from)
  while (index >= 0 && index < end) {
    const link = parseLinkAt(input, index, end)
    if (link) return link
    index = input.indexOf("[", index + 1)
  }
  return null
}

function parseLinkAt(input: string, index: number, end: number) {
  if (input[index] !== "[") return null
  const labelStart = index + 1
  const closer = input.indexOf("](", labelStart)
  if (closer < 0 || closer >= end) return null
  const labelEnd = closer
  const label = input.slice(labelStart, labelEnd)
  if (!label || label.includes("\n") || label !== label.trim()) return null
  const urlStart = closer + 2
  const urlEnd = input.indexOf(")", urlStart)
  if (urlEnd < 0 || urlEnd >= end) return null
  const href = sanitizeLinkHref(input.slice(urlStart, urlEnd))
  if (!href) return null
  return { index, labelStart, labelEnd, href, end: urlEnd + 1 }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
