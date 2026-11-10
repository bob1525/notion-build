import { createBlock, withPositions } from "@/lib/blocks"
import { applyTextChange, concatInline, splitInlineContent } from "@/lib/rich-text"
import type { BlockDTO, BlockType, EditorResult } from "@/lib/types"

type IdFactory = { createId?: () => string }

function nextId(options?: IdFactory) {
  return options?.createId?.() ?? crypto.randomUUID()
}

function listContinuation(type: BlockType): BlockType {
  if (type === "bulleted" || type === "numbered" || type === "todo") return type
  return "paragraph"
}

export function setBlockType(
  blocks: BlockDTO[],
  id: string,
  type: BlockType,
  options?: { content?: string; checked?: boolean },
) {
  return withPositions(
    blocks.map((block) => {
      if (block.id !== id) return block
      const content = type === "divider" ? "" : (options?.content ?? block.content)
      const marks = type === "divider" || type === "code" || type === "image" ? [] : applyTextChange(block.content, block.marks, content).marks
      return {
        ...block,
        type,
        content,
        marks,
        checked: type === "todo" ? (options?.checked ?? block.checked) : false,
        language: type === "code" ? block.language : "",
        collapsed: type === "toggle" ? block.collapsed : false,
        src: type === "image" ? block.src : "",
        width: type === "image" ? block.width || "medium" : "",
      }
    }),
  )
}

export function updateBlock(blocks: BlockDTO[], id: string, patch: Partial<BlockDTO>) {
  return withPositions(blocks.map((block) => (block.id === id ? { ...block, ...patch, id: block.id } : block)))
}

export function moveBlock(blocks: BlockDTO[], id: string, direction: -1 | 1) {
  const index = blocks.findIndex((block) => block.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= blocks.length) return blocks
  const next = [...blocks]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return withPositions(next)
}

export function reorderBlocks(blocks: BlockDTO[], sourceId: string, targetId: string, placement: "before" | "after") {
  if (sourceId === targetId) return blocks
  const sourceIndex = blocks.findIndex((block) => block.id === sourceId)
  if (sourceIndex < 0 || !blocks.some((block) => block.id === targetId)) return blocks
  const next = [...blocks]
  const [item] = next.splice(sourceIndex, 1)
  let insertAt = next.findIndex((block) => block.id === targetId)
  if (insertAt < 0) return blocks
  if (placement === "after") insertAt += 1
  next.splice(insertAt, 0, item)
  return withPositions(next)
}

export function insertBlockAfter(blocks: BlockDTO[], id: string, block: BlockDTO) {
  const index = blocks.findIndex((item) => item.id === id)
  const at = index < 0 ? blocks.length : index + 1
  return withPositions([...blocks.slice(0, at), block, ...blocks.slice(at)])
}

export function splitBlock(
  blocks: BlockDTO[],
  id: string,
  start: number,
  end: number,
  options?: IdFactory,
): EditorResult {
  const index = blocks.findIndex((block) => block.id === id)
  if (index < 0) return { blocks, focusId: id, caret: start }
  const block = blocks[index]

  if (block.content === "") {
    const created = createBlock({
      id: nextId(options),
      type: block.type,
      language: block.type === "code" ? block.language : "",
      parentId: block.parentId,
    })
    return { blocks: insertBlockAfter(blocks, id, created), focusId: created.id, caret: 0 }
  }

  if (block.type === "code" || block.type === "divider" || block.type === "image") {
    const created = createBlock({ id: nextId(options), parentId: block.parentId })
    return { blocks: insertBlockAfter(blocks, id, created), focusId: created.id, caret: 0 }
  }

  if (block.type === "quote" || block.type === "toggle") {
    const parts = splitInlineContent(block.content, block.marks, start, end)
    const opened = blocks.map((item) =>
      item.id === id ? { ...item, content: parts.beforeText, marks: parts.beforeMarks, collapsed: false } : item,
    )
    const created = createBlock({
      id: nextId(options),
      type: "paragraph",
      content: parts.afterText,
      marks: parts.afterMarks,
      parentId: id,
    })
    return { blocks: insertChild(opened, id, created), focusId: created.id, caret: 0 }
  }

  const parts = splitInlineContent(block.content, block.marks, start, end)
  const created = createBlock({
    id: nextId(options),
    type: listContinuation(block.type),
    content: parts.afterText,
    marks: parts.afterMarks,
    checked: block.type === "todo" ? false : block.checked,
    parentId: block.parentId,
  })
  const next = [
    ...blocks.slice(0, index),
    { ...block, content: parts.beforeText, marks: parts.beforeMarks },
    created,
    ...blocks.slice(index + 1),
  ]
  return { blocks: withPositions(next), focusId: created.id, caret: 0 }
}

export function subtreeIds(blocks: BlockDTO[], id: string, seen = new Set<string>()): string[] {
  if (seen.has(id)) return []
  seen.add(id)
  const ids = [id]
  for (const block of blocks) {
    if (block.parentId === id) ids.push(...subtreeIds(blocks, block.id, seen))
  }
  return ids
}

export function insertChild(blocks: BlockDTO[], parentId: string, block: BlockDTO) {
  const parent = blocks.find((item) => item.id === parentId)
  if (!parent || (parent.type !== "quote" && parent.type !== "toggle")) return blocks
  const child = { ...block, parentId }
  const ids = new Set(subtreeIds(blocks, parentId))
  let last = blocks.findIndex((item) => item.id === parentId)
  blocks.forEach((item, index) => {
    if (ids.has(item.id)) last = Math.max(last, index)
  })
  const next = [...blocks.slice(0, last + 1), child, ...blocks.slice(last + 1)].map((item) =>
    item.id === parentId ? { ...item, collapsed: false } : item,
  )
  return withPositions(next)
}

export function nestUnderPrevious(blocks: BlockDTO[], id: string) {
  const block = blocks.find((item) => item.id === id)
  if (!block) return blocks
  const siblings = blocks.filter((item) => item.parentId === block.parentId)
  const index = siblings.findIndex((item) => item.id === id)
  const previous = siblings[index - 1]
  if (!previous || (previous.type !== "quote" && previous.type !== "toggle")) return blocks
  if (subtreeIds(blocks, id).includes(previous.id)) return blocks
  return withPositions(blocks.map((item) => (item.id === id ? { ...item, parentId: previous.id } : item)))
}

export function unnestBlock(blocks: BlockDTO[], id: string) {
  const block = blocks.find((item) => item.id === id)
  if (!block?.parentId) return blocks
  const parent = blocks.find((item) => item.id === block.parentId)
  return withPositions(blocks.map((item) => (item.id === id ? { ...item, parentId: parent?.parentId ?? "" } : item)))
}

export function removeBlock(blocks: BlockDTO[], id: string): EditorResult {
  const index = blocks.findIndex((block) => block.id === id)
  if (index < 0) return { blocks, focusId: id, caret: 0 }
  const removeIds = new Set(subtreeIds(blocks, id))
  const next = blocks.filter((block) => !removeIds.has(block.id))
  if (!next.length) {
    const emptied = createBlock({ id: blocks[index].id, type: "paragraph", content: "" })
    return { blocks: [emptied], focusId: emptied.id, caret: 0 }
  }
  const focus = [...blocks.slice(0, index)].reverse().find((block) => !removeIds.has(block.id)) ?? next[0]
  return {
    blocks: withPositions(next),
    focusId: focus.id,
    caret: focus.type === "divider" || focus.type === "image" ? 0 : focus.content.length,
  }
}

export function backspaceAtStart(blocks: BlockDTO[], id: string): EditorResult | null {
  const index = blocks.findIndex((block) => block.id === id)
  if (index < 0) return null
  const block = blocks[index]

  if (block.content === "" || block.type === "divider" || block.type === "image") {
    return removeBlock(blocks, id)
  }

  if (index === 0) {
    if (block.type !== "paragraph" && block.type !== "code") {
      return { blocks: setBlockType(blocks, id, "paragraph"), focusId: id, caret: 0 }
    }
    return null
  }

  if (block.type === "code") return null
  const previous = blocks[index - 1]
  if (previous.type === "divider" || previous.type === "code" || previous.type === "image") return null

  const caret = previous.content.length
  const combined = concatInline(previous.content, previous.marks, block.content, block.marks)
  const merged = { ...previous, content: combined.text, marks: combined.marks }
  const next = [...blocks.slice(0, index - 1), merged, ...blocks.slice(index + 1)]
  return { blocks: withPositions(next), focusId: previous.id, caret }
}
