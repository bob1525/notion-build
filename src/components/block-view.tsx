import { blockTextClass, listMarker } from "@/components/block-style"
import { cn } from "@/lib/cn"
import type { BlockDTO } from "@/lib/types"

export function BlockView({ blocks }: { blocks: BlockDTO[] }) {
  return (
    <div className="space-y-1">
      {blocks.map((block, index) => {
        if (block.type === "divider") {
          return <hr key={block.id} className="my-3 border-black/10" />
        }
        if (block.type === "code") {
          return (
            <pre key={block.id} className="overflow-x-auto rounded-md bg-sidebar px-3 py-2.5 font-mono text-[13.5px] leading-6 text-ink">
              {block.language ? <div className="mb-1 text-[11px] uppercase tracking-wide text-faint">{block.language}</div> : null}
              <code>{block.content || " "}</code>
            </pre>
          )
        }
        const marker = listMarker(block.type, index, blocks)
        return (
          <div key={block.id} className={cn("flex gap-2", blockTextClass(block.type, "w-auto"))}>
            {block.type === "todo" ? (
              <input type="checkbox" checked={block.checked} readOnly className="mt-1.5 h-4 w-4 accent-ink" />
            ) : null}
            {marker ? <span className="w-6 shrink-0 text-right text-muted">{marker}</span> : null}
            <div className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words", block.checked && "text-muted line-through")}>
              {block.content || " "}
            </div>
          </div>
        )
      })}
    </div>
  )
}
