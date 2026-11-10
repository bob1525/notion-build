import { z } from "zod"
import { normalizeMarks } from "@/lib/rich-text"
import { BLOCK_TYPES, INLINE_MARKS, type BlockDTO, type BlockType, type InlineMark } from "@/lib/types"

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
})

export function createBlock(partial?: Partial<BlockDTO>): BlockDTO {
  const content = partial?.type === "divider" ? "" : (partial?.content ?? "")
  const type = partial?.type ?? "paragraph"
  return {
    id: partial?.id ?? crypto.randomUUID(),
    type,
    content,
    checked: partial?.checked ?? false,
    language: partial?.language ?? "",
    position: partial?.position ?? 0,
    marks: type === "divider" || type === "code" ? [] : normalizeMarks(content, partial?.marks ?? []),
  }
}

export function withPositions(blocks: BlockDTO[]): BlockDTO[] {
  return blocks.map((block, position) => {
    const content = block.type === "divider" ? "" : block.content
    const type = block.type
    return {
      ...block,
      position,
      content,
      checked: type === "todo" ? Boolean(block.checked) : false,
      language: type === "code" ? block.language.trim().toLowerCase() : "",
      marks: type === "divider" || type === "code" ? [] : normalizeMarks(content, block.marks ?? []),
    }
  })
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
