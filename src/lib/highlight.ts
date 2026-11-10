export type HighlightKind = "plain" | "keyword" | "string" | "comment" | "number"

export type HighlightToken = {
  text: string
  kind: HighlightKind
}

const JAVASCRIPT = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "class",
  "import",
  "export",
  "from",
  "new",
  "async",
  "await",
])

const PYTHON = new Set([
  "def",
  "return",
  "if",
  "else",
  "elif",
  "for",
  "while",
  "class",
  "import",
  "from",
  "in",
  "and",
  "or",
  "not",
  "True",
  "False",
  "None",
  "lambda",
])

const CSS = new Set(["color", "background", "margin", "padding", "display", "font", "border", "width", "height", "@media", "@import"])

export function highlightLanguage(language: string) {
  const value = language.trim().toLowerCase()
  if (value === "javascript" || value === "js" || value === "typescript" || value === "ts") return "javascript"
  if (value === "python" || value === "py") return "python"
  if (value === "css") return "css"
  return ""
}

export function highlightCode(source: string, language: string): HighlightToken[] {
  const kind = highlightLanguage(language)
  if (!source) return []
  if (kind === "javascript") return scan(source, { keywords: JAVASCRIPT, line: "//", block: true })
  if (kind === "python") return scan(source, { keywords: PYTHON, line: "#", block: false, triples: true })
  if (kind === "css") return scan(source, { keywords: CSS, line: "", block: true })
  return [{ text: source, kind: "plain" }]
}

function scan(
  source: string,
  options: { keywords: Set<string>; line: string; block: boolean; triples?: boolean },
): HighlightToken[] {
  const tokens: HighlightToken[] = []
  const push = (text: string, kind: HighlightKind) => {
    if (!text) return
    const last = tokens[tokens.length - 1]
    if (last && last.kind === kind) last.text += text
    else tokens.push({ text, kind })
  }
  let index = 0
  while (index < source.length) {
    const rest = source.slice(index)
    if (options.block && rest.startsWith("/*")) {
      const end = source.indexOf("*/", index + 2)
      const stop = end === -1 ? source.length : end + 2
      push(source.slice(index, stop), "comment")
      index = stop
      continue
    }
    if (options.line && rest.startsWith(options.line)) {
      const end = source.indexOf("\n", index)
      const stop = end === -1 ? source.length : end
      push(source.slice(index, stop), "comment")
      index = stop
      continue
    }
    if (options.triples && (rest.startsWith("\"\"\"") || rest.startsWith("'''"))) {
      const quote = rest.slice(0, 3)
      const end = source.indexOf(quote, index + 3)
      const stop = end === -1 ? source.length : end + 3
      push(source.slice(index, stop), "string")
      index = stop
      continue
    }
    const quote = source[index]
    if (quote === "\"" || quote === "'" || quote === "`") {
      let cursor = index + 1
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2
          continue
        }
        if (source[cursor] === quote) {
          cursor += 1
          break
        }
        if (quote !== "`" && source[cursor] === "\n") break
        cursor += 1
      }
      push(source.slice(index, cursor), "string")
      index = cursor
      continue
    }
    if (/[0-9]/.test(source[index])) {
      let cursor = index + 1
      while (cursor < source.length && /[0-9]/.test(source[cursor])) cursor += 1
      if (source[cursor] === "." && /[0-9]/.test(source[cursor + 1] ?? "")) {
        cursor += 2
        while (cursor < source.length && /[0-9]/.test(source[cursor])) cursor += 1
      }
      push(source.slice(index, cursor), "number")
      index = cursor
      continue
    }
    if (/[A-Za-z_@]/.test(source[index])) {
      let cursor = index + 1
      while (cursor < source.length && /[A-Za-z0-9_@-]/.test(source[cursor])) cursor += 1
      const word = source.slice(index, cursor)
      push(word, options.keywords.has(word) ? "keyword" : "plain")
      index = cursor
      continue
    }
    push(source[index], "plain")
    index += 1
  }
  return tokens
}
