"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, Logo } from "@/components/ui"
import { ApiError, api } from "@/lib/api-client"
import type { WorkspaceDTO } from "@/lib/types"

export function StartForm({ name }: { name: string }) {
  const router = useRouter()
  const [workspaceName, setWorkspaceName] = useState(`${name} 的空间`)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const workspace = await api<WorkspaceDTO>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: workspaceName, icon: "🌱", description: "重新开始的工作区" }),
      })
      router.push(`/w/${workspace.id}`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "没有创建工作区")
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold">先建一个工作区</h1>
      <p className="mt-2 text-sm leading-6 text-muted">你还没有任何工作区。建一个之后，就可以开始写页面。</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
          className="w-full rounded-md border border-black/10 px-3 py-2 outline-none"
          required
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "创建中…" : "创建工作区"}</Button>
      </form>
    </main>
  )
}
