import type { SearchMatch } from "@/lib/types"

export type SearchDoc = {
  id: string
  title: string
  icon: string
  updatedAt: string
  blocks: { content: string }[]
}

export function makeSnippet(text: string, query: string, radius = 36) {
  const flat = text.replace(/\s+/g, " ").trim()
  const needle = query.trim().toLowerCase()
  if (!needle) return flat.slice(0, radius * 2)
  const index = flat.toLowerCase().indexOf(needle)
  if (index < 0) return flat.slice(0, radius * 2)
  const start = Math.max(0, index - radius)
  const end = Math.min(flat.length, index + needle.length + radius)
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`
}

export function searchPages(docs: SearchDoc[], query: string, limit = 20): SearchMatch[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const hits: SearchMatch[] = []
  for (const doc of docs) {
    const title = doc.title.trim() || "未命名"
    const titleIndex = title.toLowerCase().indexOf(needle)
    if (titleIndex >= 0) {
      const normalized = title.toLowerCase()
      const score = normalized === needle ? 100 : normalized.startsWith(needle) ? 80 : 60
      hits.push({
        id: doc.id,
        title,
        icon: doc.icon,
        snippet: makeSnippet(title, needle),
        match: "title",
        score,
        updatedAt: doc.updatedAt,
      })
      continue
    }

    const blob = doc.blocks.map((block) => block.content).join("\n")
    if (blob.toLowerCase().includes(needle)) {
      hits.push({
        id: doc.id,
        title,
        icon: doc.icon,
        snippet: makeSnippet(blob, needle),
        match: "content",
        score: 30,
        updatedAt: doc.updatedAt,
      })
    }
  }

  return hits
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}
