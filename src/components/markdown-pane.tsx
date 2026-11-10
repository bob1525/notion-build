"use client"

import { BlockView } from "@/components/block-view"
import { blocksToMarkdown, markdownToBlocks } from "@/lib/markdown"
import type { BlockDTO } from "@/lib/types"

export function markdownDraftFrom(blocks: BlockDTO[]) {
  return blocksToMarkdown(blocks)
}

export function blocksFromMarkdown(source: string, previous: BlockDTO[]) {
  const parsed = markdownToBlocks(source)
  if (!parsed.length) return []
  const used = new Set<string>()
  return parsed.map((block, index) => {
    const candidate = previous[index]?.id
    const id = candidate && !used.has(candidate) ? candidate : block.id
    used.add(id)
    return { ...block, id, position: index }
  })
}

export function MarkdownPane({
  source,
  blocks,
  onChange,
}: {
  source: string
  blocks: BlockDTO[]
  onChange: (source: string) => void
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className="mb-2 block text-xs font-medium text-faint">Markdown</span>
        <textarea
          data-testid="markdown-source"
          value={source}
          onChange={(event) => onChange(event.target.value)}
          spellCheck
          className="min-h-[420px] w-full resize-y rounded-lg border border-black/[0.08] bg-cream p-3 font-mono text-[13.5px] leading-6 outline-none focus:border-accent/40"
        />
      </label>
      <div>
        <div className="mb-2 text-xs font-medium text-faint">预览</div>
        <div data-testid="markdown-preview" className="min-h-[420px] rounded-lg border border-black/[0.06] bg-white p-4">
          {blocks.some((block) => block.type === "divider" || block.content.trim()) ? (
            <BlockView blocks={blocks} />
          ) : (
            <p className="text-sm text-muted">开始写 Markdown，这里会按块渲染标题、列表、待办、代码和分割线。</p>
          )}
        </div>
      </div>
    </div>
  )
}
