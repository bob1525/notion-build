import { createBlock, withPositions } from "@/lib/blocks"
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
      return {
        ...block,
        type,
        content,
        checked: type === "todo" ? (options?.checked ?? block.checked) : false,
        language: type === "code" ? block.language : "",
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

  if (block.type === "code" || block.type === "divider") {
    const created = createBlock({ id: nextId(options) })
    return { blocks: insertBlockAfter(blocks, id, created), focusId: created.id, caret: 0 }
  }

  if ((block.type === "bulleted" || block.type === "numbered" || block.type === "todo") && block.content === "") {
    return { blocks: setBlockType(blocks, id, "paragraph", { content: "" }), focusId: id, caret: 0 }
  }

  const before = block.content.slice(0, start)
  const after = block.content.slice(end)
  const created = createBlock({
    id: nextId(options),
    type: listContinuation(block.type),
    content: after,
  })
  const next = [
    ...blocks.slice(0, index),
    { ...block, content: before },
    created,
    ...blocks.slice(index + 1),
  ]
  return { blocks: withPositions(next), focusId: created.id, caret: 0 }
}

export function removeBlock(blocks: BlockDTO[], id: string): EditorResult {
  const index = blocks.findIndex((block) => block.id === id)
  if (index < 0) return { blocks, focusId: id, caret: 0 }
  if (blocks.length === 1) {
    const emptied = createBlock({ id: blocks[0].id, type: "paragraph", content: "" })
    return { blocks: [emptied], focusId: emptied.id, caret: 0 }
  }
  const next = blocks.filter((block) => block.id !== id)
  const focus = next[Math.max(0, index - 1)]
  return {
    blocks: withPositions(next),
    focusId: focus.id,
    caret: focus.type === "divider" ? 0 : focus.content.length,
  }
}

export function backspaceAtStart(blocks: BlockDTO[], id: string): EditorResult | null {
  const index = blocks.findIndex((block) => block.id === id)
  if (index < 0) return null
  const block = blocks[index]

  if (block.type !== "paragraph" && block.type !== "code" && block.type !== "divider") {
    return { blocks: setBlockType(blocks, id, "paragraph"), focusId: id, caret: 0 }
  }

  if (block.content === "" || block.type === "divider") {
    return removeBlock(blocks, id)
  }

  if (index === 0 || block.type === "code") return null
  const previous = blocks[index - 1]
  if (previous.type === "divider" || previous.type === "code") return null

  const caret = previous.content.length
  const merged = { ...previous, content: previous.content + block.content }
  const next = [...blocks.slice(0, index - 1), merged, ...blocks.slice(index + 1)]
  return { blocks: withPositions(next), focusId: previous.id, caret }
}
