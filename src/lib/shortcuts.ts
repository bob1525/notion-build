import type { BlockType } from "@/lib/types"

export function matchBlockShortcut(beforeCaret: string): { type: BlockType; checked: boolean } | null {
  if (beforeCaret === "###") return { type: "heading3", checked: false }
  if (beforeCaret === "##") return { type: "heading2", checked: false }
  if (beforeCaret === "#") return { type: "heading1", checked: false }
  if (
    beforeCaret === "[]" ||
    beforeCaret === "[ ]" ||
    beforeCaret === "- [ ]" ||
    beforeCaret === "* [ ]"
  ) {
    return { type: "todo", checked: false }
  }
  if (beforeCaret === "-" || beforeCaret === "*" || beforeCaret === "+") {
    return { type: "bulleted", checked: false }
  }
  if (beforeCaret === "1." || beforeCaret === "1)") return { type: "numbered", checked: false }
  return null
}
