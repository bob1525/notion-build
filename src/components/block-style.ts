import { cn } from "@/lib/cn"
import type { BlockType } from "@/lib/types"

export function blockTextClass(type: BlockType, extra?: string) {
  const base = "w-full resize-none bg-transparent outline-none placeholder:text-black/25"
  if (type === "heading1") return cn(base, "text-[1.875rem] font-semibold leading-[1.25] tracking-tight", extra)
  if (type === "heading2") return cn(base, "text-2xl font-semibold leading-snug tracking-tight", extra)
  if (type === "heading3") return cn(base, "text-xl font-semibold leading-snug", extra)
  if (type === "code") return cn(base, "font-mono text-[13.5px] leading-6", extra)
  return cn(base, "text-[16.5px] leading-7", extra)
}

export function listMarker(type: BlockType, index: number, blocks: { type: BlockType }[]) {
  if (type === "bulleted") return "•"
  if (type !== "numbered") return null
  let number = 1
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (blocks[cursor].type !== "numbered") break
    number += 1
  }
  return `${number}.`
}
