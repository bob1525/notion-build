import { createBlock, withPositions } from "@/lib/blocks"
import { imageUrlError } from "@/lib/image-source"
import { blocksToMarkdown } from "@/lib/markdown"
import { normalizeMarks } from "@/lib/rich-text"
import { BLOCK_TYPES, type BlockDTO, type BlockType, type InlineMark } from "@/lib/types"

const STORAGE_KEY = "folio-clipboard"
const UPLOAD_SRC = /^\/uploads\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/i

export type ClipboardPayload =
  | { kind: "blocks"; blocks: BlockDTO[] }
  | { kind: "inline"; text: string; marks: InlineMark[] }

export function blocksBetween(blocks: BlockDTO[], anchorId: string, focusId: string) {
  const start = blocks.findIndex((block) => block.id === anchorId)
  const end = blocks.findIndex((block) => block.id === focusId)
  if (start < 0 || end < 0) return []
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  const selected = new Set(blocks.slice(from, to + 1).map((block) => block.id))
  let grew = true
  while (grew) {
    grew = false
    for (const block of blocks) {
      if (selected.has(block.id) || !block.parentId || !selected.has(block.parentId)) continue
      selected.add(block.id)
      grew = true
    }
  }
  return blocks.filter((block) => selected.has(block.id))
}

export function sliceInline(content: string, marks: InlineMark[], start: number, end: number) {
  const from = Math.max(0, Math.min(start, end, content.length))
  const to = Math.max(from, Math.min(Math.max(start, end), content.length))
  const text = content.slice(from, to)
  const sliced: InlineMark[] = []
  for (const mark of normalizeMarks(content, marks)) {
    const markStart = Math.max(mark.start, from)
    const markEnd = Math.min(mark.end, to)
    if (markEnd <= markStart) continue
    sliced.push({ ...mark, start: markStart - from, end: markEnd - from })
  }
  return { text, marks: normalizeMarks(text, sliced) }
}

export function pasteInline(content: string, marks: InlineMark[], start: number, end: number, text: string, incoming: InlineMark[]) {
  const from = Math.max(0, Math.min(start, end, content.length))
  const to = Math.max(from, Math.min(Math.max(start, end), content.length))
  const next = `${content.slice(0, from)}${text}${content.slice(to)}`
  const delta = text.length - (to - from)
  const shifted: InlineMark[] = []
  for (const mark of normalizeMarks(content, marks)) {
    if (mark.end <= from) {
      shifted.push(mark)
      continue
    }
    if (mark.start >= to) {
      shifted.push({ ...mark, start: mark.start + delta, end: mark.end + delta })
      continue
    }
    if (mark.start < from && mark.end > to) shifted.push({ ...mark, end: mark.end + delta })
    else if (mark.start < from) shifted.push({ ...mark, end: from })
    else if (mark.end > to) shifted.push({ ...mark, start: from + text.length, end: mark.end + delta })
  }
  const added = incoming.map((mark) => ({ ...mark, start: mark.start + from, end: mark.end + from }))
  return { content: next, marks: normalizeMarks(next, [...shifted, ...added]) }
}

function safeImageSrc(src: string) {
  const trimmed = src.trim()
  if (!trimmed) return ""
  if (UPLOAD_SRC.test(trimmed)) return trimmed
  if (!imageUrlError(trimmed)) return trimmed
  return ""
}

function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value)
}

function asBlocks(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) return null
  const blocks: BlockDTO[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const record = item as Record<string, unknown>
    if (typeof record.type !== "string" || !isBlockType(record.type)) return null
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim().slice(0, 80) : crypto.randomUUID()
    blocks.push(
      createBlock({
        id,
        type: record.type,
        content: typeof record.content === "string" ? record.content.slice(0, 20_000) : "",
        checked: record.checked === true,
        language: typeof record.language === "string" ? record.language.slice(0, 32) : "",
        marks: Array.isArray(record.marks) ? (record.marks as InlineMark[]) : [],
        parentId: typeof record.parentId === "string" ? record.parentId.slice(0, 80) : "",
        collapsed: record.collapsed === true,
        src: record.type === "image" && typeof record.src === "string" ? safeImageSrc(record.src) : "",
        width: record.width === "small" || record.width === "medium" || record.width === "large" ? record.width : undefined,
      }),
    )
  }
  return blocks
}

function parsePayload(value: unknown): ClipboardPayload | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (record.kind === "inline") {
    if (typeof record.text !== "string") return null
    const text = record.text.slice(0, 20_000)
    return { kind: "inline", text, marks: normalizeMarks(text, Array.isArray(record.marks) ? (record.marks as InlineMark[]) : []) }
  }
  if (record.kind === "blocks") {
    const blocks = asBlocks(record.blocks)
    if (!blocks) return null
    return { kind: "blocks", blocks }
  }
  return null
}

export function clipboardPlain(payload: ClipboardPayload) {
  if (payload.kind === "inline") return payload.text
  return blocksToMarkdown(payload.blocks)
}

export function encodeClipboardHtml(payload: ClipboardPayload) {
  return `<div data-folio-clipboard="${encodeURIComponent(JSON.stringify(payload))}"></div>`
}

export function decodeClipboardHtml(html: string): ClipboardPayload | null {
  const match = html.match(/data-folio-clipboard="([^"]+)"/)
  if (!match?.[1]) return null
  try {
    return parsePayload(JSON.parse(decodeURIComponent(match[1])))
  } catch {
    return null
  }
}

export function storeClipboard(payload: ClipboardPayload) {
  const plain = clipboardPlain(payload)
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ plain, payload }))
  } catch {
    // Private mode or a full store can refuse the write. The system clipboard still carries the text.
  }
  return plain
}

export function readStoredPayload(plain: string): ClipboardPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const record = JSON.parse(raw) as { plain?: unknown; payload?: unknown }
    if (typeof record.plain !== "string") return null
    if (plain && record.plain !== plain && record.plain.trim() !== plain.trim()) return null
    return parsePayload(record.payload)
  } catch {
    return null
  }
}

export function paragraphsFromPlain(text: string) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop()
  if (!lines.length) return []
  return lines.map((line) => createBlock({ type: "paragraph", content: line }))
}

function cloneIncoming(incoming: BlockDTO[], createId: () => string) {
  const idMap = new Map(incoming.map((block) => [block.id, createId()]))
  return incoming.map((block) =>
    createBlock({
      ...block,
      id: idMap.get(block.id),
      parentId: block.parentId && idMap.has(block.parentId) ? idMap.get(block.parentId) : "",
    }),
  )
}

export function insertPastedBlocks(blocks: BlockDTO[], targetId: string, incoming: BlockDTO[], createId: () => string) {
  const clones = cloneIncoming(incoming, createId)
  if (!clones.length) return { blocks, focusId: targetId, caret: 0 }
  const index = blocks.findIndex((block) => block.id === targetId)
  if (index < 0) return { blocks, focusId: targetId, caret: 0 }
  const target = blocks[index]
  const focus = clones[clones.length - 1]
  const caret = focus.type === "divider" || focus.type === "image" ? 0 : focus.content.length
  const next =
    target.type === "paragraph" && target.content === ""
      ? [...blocks.slice(0, index), ...clones, ...blocks.slice(index + 1)]
      : insertAfterTarget(blocks, index, clones)
  return { blocks: withPositions(next), focusId: focus.id, caret }
}

function insertAfterTarget(blocks: BlockDTO[], index: number, clones: BlockDTO[]) {
  const target = blocks[index]
  const childIds = new Set<string>()
  const walk = (id: string) => {
    for (const block of blocks) {
      if (block.parentId !== id || childIds.has(block.id)) continue
      childIds.add(block.id)
      walk(block.id)
    }
  }
  if (target) walk(target.id)
  let last = index
  blocks.forEach((block, blockIndex) => {
    if (childIds.has(block.id)) last = Math.max(last, blockIndex)
  })
  return [...blocks.slice(0, last + 1), ...clones, ...blocks.slice(last + 1)]
}
