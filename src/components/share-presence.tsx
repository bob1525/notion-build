"use client"

import { useEffect, useState } from "react"
import { api, ApiError } from "@/lib/api-client"
import { PRESENCE_POLL_MS, hasNewerRevision, type PresencePeer } from "@/lib/presence"

export function SharePresence({ pageId, revision }: { pageId: string; revision: number }) {
  const [peers, setPeers] = useState<PresencePeer[]>([])
  const [remoteRevision, setRemoteRevision] = useState(revision)

  useEffect(() => {
    let stopped = false
    async function tick() {
      try {
        const data = await api<{ revision: number; peers: PresencePeer[] }>(`/api/pages/${pageId}/presence`, {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({ activity: "viewing" }),
        })
        if (stopped) return
        setPeers(data.peers)
        setRemoteRevision((current) => Math.max(current, data.revision))
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)) stopped = true
      }
    }
    void tick()
    const interval = window.setInterval(() => {
      if (!stopped) void tick()
    }, PRESENCE_POLL_MS)
    const leave = () => {
      void fetch(`/api/pages/${pageId}/presence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity: "leave" }),
        keepalive: true,
      })
    }
    window.addEventListener("pagehide", leave)
    return () => {
      stopped = true
      window.clearInterval(interval)
      window.removeEventListener("pagehide", leave)
    }
  }, [pageId])

  const fresh = hasNewerRevision(revision, remoteRevision)

  return (
    <div className="mb-6">
      {peers.length > 0 ? (
        <div data-testid="presence-peers" role="status" aria-live="polite" aria-label="正在这页的其他人" className="mb-3 flex flex-wrap items-center gap-2">
          {peers.map((peer) => (
            <span
              key={peer.userId}
              data-testid="presence-peer"
              data-user-name={peer.name}
              data-activity={peer.activity}
              aria-label={`${peer.name}${peer.activity === "editing" ? "正在编辑" : "正在查看"}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] py-1 pl-1 pr-2 text-xs text-muted"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] font-medium text-white" aria-hidden>
                {peer.name.slice(0, 1)}
              </span>
              {peer.name}
              {peer.activity === "editing" ? "正在编辑" : "正在查看"}
            </span>
          ))}
        </div>
      ) : null}
      {fresh ? (
        <div data-testid="presence-fresh" role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm">
          <span>有新版本。刷新后可以看到最新内容。</span>
          <button type="button" data-testid="presence-refresh" className="rounded-md bg-white px-2 py-1 text-xs shadow-card" onClick={() => window.location.reload()}>
            刷新
          </button>
        </div>
      ) : null}
    </div>
  )
}
