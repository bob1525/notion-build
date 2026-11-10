import { z } from "zod"
import { normalizeMarks } from "@/lib/rich-text"
import { BLOCK_TYPES, IMAGE_WIDTHS, INLINE_MARKS, type BlockDTO, type BlockType, type ImageWidth, type InlineMark } from "@/lib/types"

export const inlineMarkSchema = z.object({
  type: z.enum(INLINE_MARKS),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
})

export const blockInputSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(BLOCK_TYPES),
  content: z.string().max(20_000).optional().default(""),
  checked: z.boolean().optional().default(false),
  language: z.string().max(32).optional().default(""),
  marks: z.array(inlineMarkSchema).max(200).optional().default([]),
  parentId: z.string().max(80).optional().default(""),
  collapsed: z.boolean().optional().default(false),
  src: z.string().max(2000).optional().default(""),
  width: z.enum(["", ...IMAGE_WIDTHS]).optional().default(""),
})

const PLAIN_MARK_TYPES = new Set<BlockType>(["divider", "code", "image"])

function imageWidth(value: string | undefined): "" | ImageWidth {
  return value === "small" || value === "medium" || value === "large" ? value : ""
}

export function createBlock(partial?: Partial<BlockDTO>): BlockDTO {
  const type = partial?.type ?? "paragraph"
  const content = type === "divider" ? "" : (partial?.content ?? "")
  return {
    id: partial?.id ?? crypto.randomUUID(),
    type,
    content,
    checked: type === "todo" ? Boolean(partial?.checked) : false,
    language: type === "code" ? (partial?.language ?? "") : "",
    position: partial?.position ?? 0,
    marks: PLAIN_MARK_TYPES.has(type) ? [] : normalizeMarks(content, partial?.marks ?? []),
    parentId: partial?.parentId ?? "",
    collapsed: type === "toggle" ? Boolean(partial?.collapsed) : false,
    src: type === "image" ? (partial?.src ?? "").trim() : "",
    width: type === "image" ? imageWidth(partial?.width) || "medium" : "",
  }
}

function validParent(block: BlockDTO, byId: Map<string, BlockDTO>) {
  const seen = new Set<string>([block.id])
  let current = block.parentId
  while (current) {
    if (seen.has(current)) return ""
    const parent = byId.get(current)
    if (!parent || (parent.type !== "quote" && parent.type !== "toggle")) return ""
    seen.add(current)
    current = parent.parentId
  }
  return block.parentId
}

export function withPositions(blocks: BlockDTO[]): BlockDTO[] {
  const prepared = blocks.map((block, position) => {
    const type = block.type
    const content = type === "divider" ? "" : block.content
    return {
      ...block,
      position,
      content,
      checked: type === "todo" ? Boolean(block.checked) : false,
      language: type === "code" ? block.language.trim().toLowerCase() : "",
      marks: PLAIN_MARK_TYPES.has(type) ? [] : normalizeMarks(content, block.marks ?? []),
      parentId: block.parentId ?? "",
      collapsed: type === "toggle" ? Boolean(block.collapsed) : false,
      src: type === "image" ? (block.src ?? "").trim() : "",
      width: (type === "image" ? imageWidth(block.width) || "medium" : "") as BlockDTO["width"],
    }
  })
  const byId = new Map(prepared.map((block) => [block.id, block]))
  return prepared.map((block) => ({ ...block, parentId: validParent(block, byId) }))
}

export function ensureBlocks(blocks: BlockDTO[], pageId: string) {
  if (blocks.length) return withPositions(blocks)
  return [createBlock({ id: `empty-${pageId}`, type: "paragraph", content: "" })]
}

export function normalizeBlocks(input: Array<z.input<typeof blockInputSchema>>): BlockDTO[] {
  const seen = new Set<string>()
  const blocks = input.slice(0, 400).map((block, index) => {
    let id = block.id
    if (seen.has(id)) id = `${id}-${index}`.slice(0, 80)
    seen.add(id)
    return createBlock({
      id,
      type: block.type,
      content: block.content,
      checked: block.checked,
      language: block.language,
      marks: (block.marks ?? []) as InlineMark[],
      parentId: block.parentId,
      collapsed: block.collapsed,
      src: block.src,
      width: block.width,
      position: index,
    })
  })
  return withPositions(blocks)
}

export function semanticBlocks(
  blocks: Array<Pick<BlockDTO, "type" | "content" | "checked" | "language">>,
) {
  return blocks.map((block) => ({
    type: block.type as BlockType,
    content: block.type === "divider" ? "" : block.content,
    checked: block.type === "todo" ? Boolean(block.checked) : false,
    language: block.type === "code" ? block.language : "",
  }))
}
