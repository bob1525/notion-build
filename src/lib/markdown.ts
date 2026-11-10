import { createBlock } from "@/lib/blocks"
import type { BlockDTO, BlockType } from "@/lib/types"

type MarkdownBlock = Pick<BlockDTO, "type" | "content" | "checked" | "language">

function isFenceClose(line: string) {
  return /^```\s*$/.test(line)
}

function isSpecialLine(line: string) {
  return (
    /^```/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim()) ||
    /^(#{1,6})(?!#)\s+/.test(line) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(line)
  )
}

export function blocksToMarkdown(blocks: MarkdownBlock[]) {
  const lines: string[] = []
  let numberedRun = 0
  blocks.forEach((block, index) => {
    if (block.type === "numbered") numberedRun += 1
    else numberedRun = 0
    if (index > 0) lines.push("")
    switch (block.type) {
      case "heading1":
        lines.push(`# ${block.content}`)
        break
      case "heading2":
        lines.push(`## ${block.content}`)
        break
      case "heading3":
        lines.push(`### ${block.content}`)
        break
      case "bulleted":
        lines.push(`- ${block.content}`)
        break
      case "numbered":
        lines.push(`${numberedRun}. ${block.content}`)
        break
      case "todo":
        lines.push(`- [${block.checked ? "x" : " "}] ${block.content}`)
        break
      case "code":
        lines.push(`\`\`\`${block.language || ""}`)
        lines.push(block.content)
        lines.push("```")
        break
      case "divider":
        lines.push("---")
        break
      default:
        lines.push(block.content)
    }
  })
  const text = lines.join("\n").trim()
  return text ? `${text}\n` : ""
}

export function markdownToBlocks(markdown: string): BlockDTO[] {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const blocks: BlockDTO[] = []
  let index = 0

  const push = (partial: { type: BlockType; content?: string; checked?: boolean; language?: string }) => {
    blocks.push(
      createBlock({
        type: partial.type,
        content: partial.content ?? "",
        checked: partial.checked ?? false,
        language: partial.language ?? "",
        position: blocks.length,
      }),
    )
  }

  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === "") {
      index += 1
      continue
    }

    const fence = line.match(/^```([\w+-]*)\s*$/)
    if (fence) {
      const language = fence[1] || ""
      const body: string[] = []
      index += 1
      while (index < lines.length && !isFenceClose(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      push({ type: "code", language, content: body.join("\n") })
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      push({ type: "divider" })
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,3})(?!#)\s+(.*)$/)
    if (heading) {
      push({ type: `heading${heading[1].length}` as BlockType, content: heading[2] })
      index += 1
      continue
    }

    const todo = line.match(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/)
    if (todo) {
      push({ type: "todo", checked: todo[1].toLowerCase() === "x", content: todo[2] })
      index += 1
      continue
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    if (bullet) {
      push({ type: "bulleted", content: bullet[1] })
      index += 1
      continue
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (numbered) {
      push({ type: "numbered", content: numbered[1] })
      index += 1
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() !== "" && !isSpecialLine(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    push({ type: "paragraph", content: paragraph.join("\n") })
  }

  return blocks
}
