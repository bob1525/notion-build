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

export const MAX_BLOCK_DEPTH = 7
export const BLOCK_MOVE_SELF = "不能把块拖到自己身上"
export const BLOCK_MOVE_DESCENDANT = "不能把块拖进自己的子块"
export const BLOCK_MOVE_DEPTH = "块最多嵌套 8 层"
export const BLOCK_MOVE_MISSING = "找不到这个块"

export type BlockPlacement = "before" | "after" | "inside"
export type BlockMoveResult = { ok: true; blocks: BlockDTO[] } | { ok: false; message: string }

export function outlineBlocks(blocks: BlockDTO[]) {
  const ids = new Set(blocks.map((block) => block.id))
  const groups = new Map<string, BlockDTO[]>()
  for (const block of blocks) {
    const key = block.parentId && ids.has(block.parentId) ? block.parentId : ""
    const list = groups.get(key)
    if (list) list.push(block)
    else groups.set(key, [block])
  }
  const ordered: BlockDTO[] = []
  const seen = new Set<string>()
  const walk = (parentId: string, hidden: boolean) => {
    for (const block of groups.get(parentId) ?? []) {
      if (seen.has(block.id)) continue
      seen.add(block.id)
      if (!hidden) ordered.push(block)
      walk(block.id, hidden || (block.type === "toggle" && block.collapsed))
    }
  }
  walk("", false)
  return ordered
}

function blockDepth(blocks: BlockDTO[], id: string) {
  const byId = new Map(blocks.map((block) => [block.id, block]))
  let depth = 0
  let current = byId.get(id)?.parentId ?? ""
  const seen = new Set<string>([id])
  while (current) {
    if (seen.has(current) || !byId.has(current)) break
    seen.add(current)
    depth += 1
    current = byId.get(current)?.parentId ?? ""
  }
  return depth
}

function subtreeHeight(blocks: BlockDTO[], id: string) {
  let max = 0
  const walk = (current: string, depth: number, seen: Set<string>) => {
    if (seen.has(current)) return
    seen.add(current)
    if (depth > max) max = depth
    for (const block of blocks) {
      if (block.parentId === current) walk(block.id, depth + 1, seen)
    }
  }
  walk(id, 0, new Set())
  return max
}

function subtreeList(blocks: BlockDTO[], id: string) {
  const ids = new Set(subtreeIds(blocks, id))
  return blocks.filter((block) => ids.has(block.id))
}

function insertAfterSubtree(blocks: BlockDTO[], targetId: string, incoming: BlockDTO[]) {
  const ids = new Set(subtreeIds(blocks, targetId))
  let last = blocks.findIndex((block) => block.id === targetId)
  blocks.forEach((block, index) => {
    if (ids.has(block.id)) last = Math.max(last, index)
  })
  const at = last < 0 ? blocks.length : last + 1
  return [...blocks.slice(0, at), ...incoming, ...blocks.slice(at)]
}

export function moveNestedBlock(blocks: BlockDTO[], sourceId: string, targetId: string, placement: BlockPlacement): BlockMoveResult {
  if (sourceId === targetId) return { ok: false, message: BLOCK_MOVE_SELF }
  const source = blocks.find((block) => block.id === sourceId)
  const target = blocks.find((block) => block.id === targetId)
  if (!source || !target) return { ok: false, message: BLOCK_MOVE_MISSING }
  const descendants = new Set(subtreeIds(blocks, sourceId))
  const destinationParent = placement === "inside" ? targetId : target.parentId
  if (destinationParent && descendants.has(destinationParent)) return { ok: false, message: BLOCK_MOVE_DESCENDANT }
  const nextDepth = destinationParent ? blockDepth(blocks, destinationParent) + 1 : 0
  if (nextDepth + subtreeHeight(blocks, sourceId) > MAX_BLOCK_DEPTH) return { ok: false, message: BLOCK_MOVE_DEPTH }

  const moving = subtreeList(blocks, sourceId).map((block) => (block.id === sourceId ? { ...block, parentId: destinationParent } : block))
  const rest = blocks
    .filter((block) => !descendants.has(block.id))
    .map((block) => (placement === "inside" && block.id === targetId && block.type === "toggle" ? { ...block, collapsed: false } : block))
  const inserted = placement === "before"
    ? (() => {
        const at = rest.findIndex((block) => block.id === targetId)
        const index = at < 0 ? rest.length : at
        return [...rest.slice(0, index), ...moving, ...rest.slice(index)]
      })()
    : insertAfterSubtree(rest, targetId, moving)
  return { ok: true, blocks: withPositions(inserted) }
}

export function moveBlock(blocks: BlockDTO[], id: string, direction: -1 | 1) {
  const block = blocks.find((item) => item.id === id)
  if (!block) return blocks
  const siblings = blocks.filter((item) => item.parentId === block.parentId)
  const index = siblings.findIndex((item) => item.id === id)
  const target = siblings[index + direction]
  if (!target) return blocks
  const result = moveNestedBlock(blocks, id, target.id, direction < 0 ? "before" : "after")
  return result.ok ? result.blocks : blocks
}

export function reorderBlocks(blocks: BlockDTO[], sourceId: string, targetId: string, placement: "before" | "after") {
  if (sourceId === targetId) return blocks
  const result = moveNestedBlock(blocks, sourceId, targetId, placement)
  return result.ok ? result.blocks : blocks
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

export function indentBlock(blocks: BlockDTO[], id: string): BlockMoveResult {
  const block = blocks.find((item) => item.id === id)
  if (!block) return { ok: false, message: BLOCK_MOVE_MISSING }
  const siblings = blocks.filter((item) => item.parentId === block.parentId)
  const previous = siblings[siblings.findIndex((item) => item.id === id) - 1]
  if (!previous) return { ok: false, message: "前面没有可以缩进到的块" }
  return moveNestedBlock(blocks, id, previous.id, "inside")
}

export function nestUnderPrevious(blocks: BlockDTO[], id: string) {
  const result = indentBlock(blocks, id)
  return result.ok ? result.blocks : blocks
}

export function unnestBlock(blocks: BlockDTO[], id: string) {
  const block = blocks.find((item) => item.id === id)
  if (!block?.parentId) return blocks
  const parent = blocks.find((item) => item.id === block.parentId)
  if (!parent) return withPositions(blocks.map((item) => (item.id === id ? { ...item, parentId: "" } : item)))
  const siblings = blocks.filter((item) => item.parentId === block.parentId)
  const following = siblings.slice(siblings.findIndex((item) => item.id === id) + 1)
  const followingIds = new Set<string>()
  for (const sibling of following) {
    for (const childId of subtreeIds(blocks, sibling.id)) followingIds.add(childId)
  }
  const ownIds = new Set(subtreeIds(blocks, id))
  const removed = new Set<string>([...ownIds, ...followingIds])
  const own = blocks.filter((item) => ownIds.has(item.id)).map((item) => (item.id === id ? { ...item, parentId: parent.parentId } : item))
  const adopted = blocks.filter((item) => followingIds.has(item.id)).map((item) => (following.some((sibling) => sibling.id === item.id) ? { ...item, parentId: id } : item))
  const rest = blocks.filter((item) => !removed.has(item.id))
  return withPositions(insertAfterSubtree(rest, parent.id, [...own, ...adopted]))
}

export function outdentBlock(blocks: BlockDTO[], id: string): BlockMoveResult {
  const block = blocks.find((item) => item.id === id)
  if (!block) return { ok: false, message: BLOCK_MOVE_MISSING }
  if (!block.parentId) return { ok: false, message: "这一块已经在最外层" }
  return { ok: true, blocks: unnestBlock(blocks, id) }
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
