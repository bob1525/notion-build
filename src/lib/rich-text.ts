import { INLINE_MARKS, type InlineMark, type InlineMarkType } from "@/lib/types"

export type InlineSegment = {
  text: string
  marks: InlineMarkType[]
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

export function normalizeMarks(text: string, marks: InlineMark[]): InlineMark[] {
  const length = text.length
  const clean = marks
    .filter((mark): mark is InlineMark => INLINE_MARKS.includes(mark.type))
    .map((mark) => ({
      type: mark.type,
      start: clamp(Math.floor(mark.start), 0, length),
      end: clamp(Math.floor(mark.end), 0, length),
    }))
    .filter((mark) => mark.end > mark.start)

  const merged: InlineMark[] = []
  for (const type of INLINE_MARKS) {
    const ranges = clean
      .filter((mark) => mark.type === type)
      .map((mark) => [mark.start, mark.end] as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let current: [number, number] | null = null
    for (const range of ranges) {
      if (!current || range[0] > current[1]) {
        if (current) merged.push({ type, start: current[0], end: current[1] })
        current = [range[0], range[1]]
      } else {
        current = [current[0], Math.max(current[1], range[1])]
      }
    }
    if (current) merged.push({ type, start: current[0], end: current[1] })
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
    const slice = text.slice(start, end)
    const previous = segments[segments.length - 1]
    if (previous && sameMarks(previous.marks, active)) previous.text += slice
    else segments.push({ text: slice, marks: active })
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
      if (mark.start < from) next.push({ type, start: mark.start, end: from })
      if (mark.end > to) next.push({ type, start: to, end: mark.end })
    }
    return normalizeMarks(text, next)
  }
  return normalizeMarks(text, [...normalized, { type, start: from, end: to }])
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
      result.push({ type: mark.type, start: mark.start + shift, end: mark.end + shift })
      continue
    }
    if (mark.start < prefix) result.push({ type: mark.type, start: mark.start, end: prefix })
    if (mark.end > deletedEnd) result.push({ type: mark.type, start: insertedEnd, end: mark.end + shift })
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
  if (!/[*`~]/.test(text)) return { text, marks: normalizeMarks(text, marks), map: identity }
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
    if (mark.start < from) before.push({ type: mark.type, start: mark.start, end: Math.min(mark.end, from) })
    if (mark.end > to) after.push({ type: mark.type, start: Math.max(mark.start, to) - to, end: mark.end - to })
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
  const shifted = rightMarks.map((mark) => ({
    type: mark.type,
    start: mark.start + leftText.length,
    end: mark.end + leftText.length,
  }))
  return { text, marks: normalizeMarks(text, [...leftMarks, ...shifted]) }
}

function parseRange(input: string, start: number, end: number): { text: string; marks: InlineMark[]; map: number[] } {
  let text = ""
  const marks: InlineMark[] = []
  const map: number[] = []
  let index = start
  while (index < end) {
    const opener = earliestOpener(input, index, end)
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
      marks.push({ type: mark.type, start: at + mark.start, end: at + mark.end })
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
    if (start >= 0 && end > start) next.push({ type: mark.type, start, end })
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
