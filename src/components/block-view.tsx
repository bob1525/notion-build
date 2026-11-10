import { blockTextClass, listMarker } from "@/components/block-style"
import { CodeText } from "@/components/code-text"
import { DividerRule } from "@/components/divider-rule"
import { InlineText } from "@/components/inline-text"
import { cn } from "@/lib/cn"
import { imageWidthOf } from "@/lib/image-source"
import type { BlockDTO } from "@/lib/types"

function BlockTree({ blocks, items }: { blocks: BlockDTO[]; items: BlockDTO[] }) {
  return (
    <>
      {items.map((block, index) => {
        const children = blocks.filter((item) => item.parentId === block.id)
        if (block.type === "divider") {
          return <DividerRule key={block.id} />
        }
        if (block.type === "image") {
          const width = imageWidthOf(block.width)
          return (
            <figure key={block.id} data-testid="image-frame" data-width={width} className={cn("image-frame", `image-${width}`)}>
              {block.src ? (
                // User-supplied addresses and local uploads are not known to the image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={block.src} alt={block.content || "图片"} className="h-auto w-full rounded-md" />
              ) : (
                <div className="text-sm text-muted">未添加图片</div>
              )}
            </figure>
          )
        }
        if (block.type === "code") {
          return (
            <pre key={block.id} className="overflow-x-auto rounded-md bg-sidebar px-3 py-2.5 font-mono text-[13.5px] leading-6 text-ink">
              {block.language ? <div className="mb-1 text-[11px] uppercase tracking-wide text-faint">{block.language}</div> : null}
              <code>
                <CodeText code={block.content} language={block.language} />
              </code>
            </pre>
          )
        }
        const marker = listMarker(block.type, index, items)
        const nested = (
          children.length && !(block.type === "toggle" && block.collapsed) ? (
            <div data-testid={block.type === "quote" ? "quote-children" : "toggle-body"} className="mt-1 ml-3 border-l border-black/10 pl-3">
              <BlockTree blocks={blocks} items={children} />
            </div>
          ) : null
        )
        return (
          <div key={block.id} className={cn(block.type === "quote" && "folio-quote")} data-block-type={block.type} data-collapsed={block.type === "toggle" ? String(block.collapsed) : undefined}>
            <div className={cn("flex gap-2", blockTextClass(block.type, "w-auto"))}>
              {block.type === "todo" ? <input type="checkbox" checked={block.checked} readOnly className="mt-1.5 h-4 w-4 accent-ink" /> : null}
              {block.type === "toggle" ? <span className={cn("mt-1.5 text-muted", !block.collapsed && "rotate-90")}>▸</span> : null}
              {marker ? <span className="w-6 shrink-0 text-right text-muted">{marker}</span> : null}
              <div className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words", block.checked && "text-muted line-through")}>
                {block.content ? <InlineText text={block.content} marks={block.marks} /> : " "}
              </div>
            </div>
            {nested}
          </div>
        )
      })}
    </>
  )
}

export function BlockView({ blocks }: { blocks: BlockDTO[] }) {
  const roots = blocks.filter((block) => !block.parentId)
  return (
    <div className="space-y-1">
      <BlockTree blocks={blocks} items={roots} />
    </div>
  )
}
