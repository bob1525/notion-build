import { z } from "zod"
import { BLOCK_TYPES, type BlockDTO, type BlockType } from "@/lib/types"

export const blockInputSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(BLOCK_TYPES),
  content: z.string().max(20_000).optional().default(""),
  checked: z.boolean().optional().default(false),
  language: z.string().max(32).optional().default(""),
})

export function createBlock(partial?: Partial<BlockDTO>): BlockDTO {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    type: partial?.type ?? "paragraph",
    content: partial?.content ?? "",
    checked: partial?.checked ?? false,
    language: partial?.language ?? "",
    position: partial?.position ?? 0,
  }
}

export function withPositions(blocks: BlockDTO[]): BlockDTO[] {
  return blocks.map((block, position) => ({
    ...block,
    position,
    content: block.type === "divider" ? "" : block.content,
    checked: block.type === "todo" ? Boolean(block.checked) : false,
    language: block.type === "code" ? block.language.trim().toLowerCase() : "",
  }))
}

export function ensureBlocks(blocks: BlockDTO[], pageId: string) {
  if (blocks.length) return withPositions(blocks)
  return [createBlock({ id: `empty-${pageId}`, type: "paragraph", content: "" })]
}

export function normalizeBlocks(input: z.infer<typeof blockInputSchema>[]): BlockDTO[] {
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
