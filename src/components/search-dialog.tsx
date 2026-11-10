"use client"

import { Search } from "lucide-react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useWorkspace } from "@/components/workspace-provider"
import { ApiError, api } from "@/lib/api-client"
import { displayTitle } from "@/lib/format"
import type { SearchScope } from "@/lib/search"
import type { SearchHit } from "@/lib/types"

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { workspace, pages } = useWorkspace()
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<SearchScope>("all")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)

  const recent = useMemo(
    () =>
      [...pages]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 8)
        .map((page) => ({
          id: page.id,
          title: displayTitle(page.title),
          icon: page.icon,
          snippet: page.visibility === "private" ? "私有页面" : page.visibility === "read" ? "公开只读" : "公开可编辑",
          breadcrumb: "",
          match: "title" as const,
        })),
    [pages],
  )

  useEffect(() => {
    const needle = query.trim()
    if (!needle) {
      setHits([])
      setLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api<SearchHit[]>(
          `/api/workspaces/${workspace.id}/search?q=${encodeURIComponent(needle)}&scope=${scope}`,
          { signal: controller.signal },
        )
        setHits(data)
        setActive(0)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(cause instanceof ApiError ? cause.message : "搜索失败")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 180)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, scope, workspace.id])

  const results = query.trim() ? hits : recent

  function open(id: string) {
    router.push(`/w/${workspace.id}/p/${id}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center px-3 pb-3 sm:items-start sm:px-4 sm:pb-0 sm:pt-[12vh]">
      <button className="absolute inset-0 bg-black/30" aria-label="关闭搜索" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="搜索页面" className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-pop">
        <div className="flex items-center gap-2 border-b border-black/[0.06] px-3">
          <Search size={16} className="text-faint" />
          <input
            data-testid="search-input"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose()
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)))
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                setActive((index) => Math.max(index - 1, 0))
              }
              if (event.key === "Enter" && results[active]) open(results[active].id)
            }}
            placeholder="搜索标题和正文"
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-black/30"
          />
        </div>
        <div className="max-h-[min(360px,50dvh)] overflow-y-auto p-2">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="text-[11px] font-medium text-faint">
              {query.trim() ? (loading ? "正在搜索…" : "结果") : "最近编辑"}
            </div>
            <div className="flex rounded-md bg-black/[0.04] p-0.5" role="group" aria-label="搜索范围">
              {([
                ["all", "全部"],
                ["title", "标题"],
                ["content", "正文"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`search-scope-${value}`}
                  aria-pressed={scope === value}
                  onClick={() => setScope(value)}
                  className={`rounded px-2 py-0.5 text-xs ${scope === value ? "bg-white shadow-card" : "text-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="px-2 py-6 text-center text-sm leading-6 text-danger">{error}</p> : null}
          {!error && results.length === 0 ? (
            <p data-testid="search-empty" className="px-2 py-8 text-center text-sm leading-6 text-muted">
              {query.trim() ? `没有找到“${query.trim()}”` : "这个工作区还没有可搜索的页面"}
            </p>
          ) : null}
          {results.map((result, index) => (
            <button
              key={result.id}
              type="button"
              data-testid="search-result"
              data-title={result.title}
              data-match={result.match}
              onMouseEnter={() => setActive(index)}
              onClick={() => open(result.id)}
              className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left ${index === active ? "bg-black/[0.05]" : ""}`}
            >
              <span className="mt-0.5 text-base leading-none">{result.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  <Highlight text={result.title} query={query.trim()} />
                </span>
                <span className="block truncate text-xs text-muted">
                  {result.breadcrumb ? `${result.breadcrumb} · ` : ""}
                  <Highlight text={result.snippet} query={query.trim()} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const needle = query.toLowerCase()
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  while (cursor < text.length) {
    const index = lower.indexOf(needle, cursor)
    if (index < 0) {
      parts.push(text.slice(cursor))
      break
    }
    if (index > cursor) parts.push(text.slice(cursor, index))
    parts.push(
      <mark key={index} data-testid="search-highlight" className="rounded-sm bg-[#fdecc8] text-inherit">
        {text.slice(index, index + needle.length)}
      </mark>,
    )
    cursor = index + needle.length
  }
  return <>{parts}</>
}
