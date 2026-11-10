"use client"

import { useState } from "react"
import { ApiError, api } from "@/lib/api-client"
import { cn } from "@/lib/cn"
import { imageUrlError, imageWidthOf } from "@/lib/image-source"
import type { BlockDTO, ImageWidth } from "@/lib/types"

const WIDTHS: Array<{ id: ImageWidth; label: string }> = [
  { id: "small", label: "小" },
  { id: "medium", label: "中" },
  { id: "large", label: "大" },
]

export function ImageBlock({
  block,
  onPatch,
}: {
  block: BlockDTO
  onPatch: (patch: Partial<Pick<BlockDTO, "src" | "width" | "content">>) => void
}) {
  const [draft, setDraft] = useState(block.src)
  const [error, setError] = useState("")
  const width = imageWidthOf(block.width)

  async function upload(file: File) {
    const body = new FormData()
    body.append("file", file)
    try {
      const saved = await api<{ url: string }>("/api/uploads", { method: "POST", body })
      setError("")
      setDraft(saved.url)
      onPatch({ src: saved.url, width })
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "上传失败")
    }
  }

  function commitUrl() {
    const message = imageUrlError(draft)
    if (message) {
      setError(message)
      return
    }
    setError("")
    onPatch({ src: draft.trim(), width })
  }

  return (
    <div data-testid="image-block" className="rounded-md border border-black/[0.06] bg-cream/60 p-3">
      {block.src ? (
        <figure data-testid="image-frame" data-width={width} className={cn("image-frame", `image-${width}`)}>
          {/* User-supplied addresses and local uploads are not known to the image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-testid="image-preview"
            src={block.src}
            alt={block.content || "图片"}
            className="h-auto w-full rounded-md"
            onError={() => setError("图片无法显示")}
          />
        </figure>
      ) : (
        <div className="text-sm text-muted">用地址插入，或从本机上传。</div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          data-testid="image-url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commitUrl()
            }
          }}
          placeholder="https:// 图片地址"
          aria-label="图片地址"
          className="min-w-0 flex-1 rounded-md border border-black/[0.08] bg-white px-2 py-1 text-sm outline-none"
        />
        <button type="button" data-testid="image-url-submit" onClick={commitUrl} className="rounded-md bg-ink px-2 py-1 text-xs text-white">
          插入
        </button>
        <label className="cursor-pointer rounded-md border border-black/[0.08] bg-white px-2 py-1 text-xs">
          上传
          <input
            data-testid="image-file"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void upload(file)
            }}
          />
        </label>
        {WIDTHS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`image-width-${item.id}`}
            aria-pressed={width === item.id}
            onClick={() => onPatch({ width: item.id })}
            className={cn("rounded-md px-2 py-1 text-xs", width === item.id ? "bg-ink text-white" : "bg-white text-muted")}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? <p data-testid="image-error" className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  )
}
