import { createBlock } from "@/lib/blocks"
import { parseInlineMarkup, serializeInlineMarkup } from "@/lib/rich-text"
import type { BlockDTO, BlockType } from "@/lib/types"

type MarkdownBlock = Pick<BlockDTO, "id" | "type" | "content" | "checked" | "language" | "marks" | "parentId" | "collapsed" | "src" | "width">

function isFenceClose(line: string) {
  return /^```\s*$/.test(line)
}

function isSpecialLine(line: string) {
  return (
    /^```/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim()) ||
    /^(#{1,6})(?!#)\s+/.test(line) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^:::/.test(line)
  )
}

function emitBlock(lines: string[], block: MarkdownBlock, numberedRun: { value: number }) {
  if (block.type === "numbered") numberedRun.value += 1
  else numberedRun.value = 0
  const text = block.type === "code" || block.type === "divider" || block.type === "image" ? block.content : serializeInlineMarkup(block.content, block.marks ?? [])
  switch (block.type) {
    case "heading1":
      lines.push(`# ${text}`)
      break
    case "heading2":
      lines.push(`## ${text}`)
      break
    case "heading3":
      lines.push(`### ${text}`)
      break
    case "bulleted":
      lines.push(`- ${text}`)
      break
    case "numbered":
      lines.push(`${numberedRun.value}. ${text}`)
      break
    case "todo":
      lines.push(`- [${block.checked ? "x" : " "}] ${text}`)
      break
    case "code":
      lines.push(`\`\`\`${block.language || ""}`)
      lines.push(block.content)
      lines.push("```")
      break
    case "divider":
      lines.push("---")
      break
    case "quote":
      lines.push(...(text ? text.split("\n").map((line) => `> ${line}`) : ["> "]))
      break
    case "toggle":
      lines.push(`:::toggle ${block.collapsed ? "closed" : "open"}`)
      lines.push(text)
      lines.push(":::")
      break
    case "image":
      lines.push(`:::image ${block.width || "medium"}`)
      lines.push(block.src ?? "")
      if (text) lines.push(text)
      lines.push(":::")
      break
    default:
      lines.push(text)
  }
}

function markdownFor(blocks: MarkdownBlock[], parentId: string): string {
  const lines: string[] = []
  const siblings = blocks.filter((block) => (block.parentId ?? "") === parentId)
  const numberedRun = { value: 0 }
  siblings.forEach((block, index) => {
    if (index > 0) lines.push("")
    emitBlock(lines, block, numberedRun)
    const nested = markdownFor(blocks, block.id).trim()
    if (nested) {
      lines.push(":::child")
      lines.push(nested)
      lines.push(":::")
    }
  })
  const text = lines.join("\n").trim()
  return text ? `${text}\n` : ""
}

export function blocksToMarkdown(blocks: MarkdownBlock[]) {
  return markdownFor(blocks, "")
}

export function markdownToBlocks(markdown: string): BlockDTO[] {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const blocks: BlockDTO[] = []
  let index = 0

  let lastContainer = ""

  const push = (partial: {
    type: BlockType
    content?: string
    checked?: boolean
    language?: string
    parentId?: string
    collapsed?: boolean
    src?: string
    width?: "" | "small" | "medium" | "large"
  }) => {
    const raw = partial.content ?? ""
    const inline = partial.type === "code" || partial.type === "divider" || partial.type === "image" ? { text: raw, marks: [] } : parseInlineMarkup(raw)
    const block = createBlock({
      type: partial.type,
      content: inline.text,
      marks: inline.marks,
      checked: partial.checked ?? false,
      language: partial.language ?? "",
      parentId: partial.parentId ?? "",
      collapsed: partial.collapsed ?? false,
      src: partial.src ?? "",
      width: partial.width,
      position: blocks.length,
    })
    blocks.push(block)
    if (block.type === "quote" || block.type === "toggle") lastContainer = block.id
    return block
  }

  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === "") {
      index += 1
      continue
    }

    if (line.trim() === ":::child") {
      const body: string[] = []
      index += 1
      while (index < lines.length && lines[index].trim() !== ":::") {
        body.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      const inner = markdownToBlocks(body.join("\n"))
      for (const child of inner) {
        blocks.push(createBlock({ ...child, parentId: child.parentId || lastContainer, position: blocks.length }))
      }
      continue
    }

    const toggle = line.match(/^:::toggle\s+(open|closed)\s*$/)
    if (toggle) {
      const body: string[] = []
      index += 1
      while (index < lines.length && lines[index].trim() !== ":::") {
        body.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      push({ type: "toggle", content: body.join("\n"), collapsed: toggle[1] === "closed" })
      continue
    }

    const image = line.match(/^:::image\s+(small|medium|large)\s*$/)
    if (image) {
      const body: string[] = []
      index += 1
      while (index < lines.length && lines[index].trim() !== ":::") {
        body.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      const [src = "", ...alt] = body
      push({ type: "image", src: src.trim(), content: alt.join("\n"), width: image[1] as "small" | "medium" | "large" })
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      const body = [quote[1]]
      index += 1
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^>\s?/, ""))
        index += 1
      }
      push({ type: "quote", content: body.join("\n").replace(/\s+$/, "") })
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
