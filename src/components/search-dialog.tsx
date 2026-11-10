"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useWorkspace } from "@/components/workspace-provider"
import { ApiError, api } from "@/lib/api-client"
import { displayTitle } from "@/lib/format"
import type { SearchHit } from "@/lib/types"

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { workspace, pages } = useWorkspace()
  const [query, setQuery] = useState("")
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
          snippet: page.visibility === "private" ? "私有页面" : "公开页面",
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
          `/api/workspaces/${workspace.id}/search?q=${encodeURIComponent(needle)}`,
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
  }, [query, workspace.id])

  const results = query.trim() ? hits : recent

  function open(id: string) {
    router.push(`/w/${workspace.id}/p/${id}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
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
        <div className="max-h-[360px] overflow-y-auto p-2">
          <div className="px-2 py-1 text-[11px] font-medium text-faint">
            {query.trim() ? (loading ? "搜索中…" : "结果") : "最近编辑"}
          </div>
          {error ? <p className="px-2 py-6 text-center text-sm text-danger">{error}</p> : null}
          {!error && results.length === 0 ? (
            <p data-testid="search-empty" className="px-2 py-8 text-center text-sm text-muted">
              {query.trim() ? `没有找到“${query.trim()}”` : "这个工作区还没有可搜索的页面"}
            </p>
          ) : null}
          {results.map((result, index) => (
            <button
              key={result.id}
              type="button"
              data-testid="search-result"
              data-title={result.title}
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
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-[#fdecc8] text-inherit">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  )
}
