"use client"

import { Check, ChevronDown, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, Dialog } from "@/components/ui"
import { useWorkspace } from "@/components/workspace-provider"
import { EMOJIS } from "@/lib/constants"
import { cn } from "@/lib/cn"
import { ApiError } from "@/lib/api-client"

export function WorkspaceSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter()
  const { workspace, workspaces, createWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [icon, setIcon] = useState("🏠")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await createWorkspace({ name, icon })
      setCreating(false)
      setOpen(false)
      setName("")
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "没有创建工作区")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="workspace-switcher"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-black/[0.04]"
      >
        <span className="text-lg leading-none">{workspace.icon}</span>
        <span data-testid="workspace-name" className="min-w-0 flex-1 truncate text-sm font-semibold">
          {workspace.name}
        </span>
        <ChevronDown size={14} className="text-faint" />
      </button>
      {open ? (
        <>
          <button className="fixed inset-0 z-20 cursor-default" aria-label="关闭工作区菜单" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg bg-white p-1 shadow-pop">
            {workspaces.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid="workspace-option"
                data-name={item.name}
                onClick={() => {
                  setOpen(false)
                  if (item.id !== workspace.id) {
                    onNavigate?.()
                    router.push(`/w/${item.id}`)
                  }
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/[0.04]"
              >
                <span>{item.icon}</span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.id === workspace.id ? <Check size={14} /> : null}
              </button>
            ))}
            <button
              type="button"
              data-testid="new-workspace"
              onClick={() => {
                setOpen(false)
                setCreating(true)
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-black/[0.06] px-2 py-2 text-left text-sm text-muted hover:bg-black/[0.04]"
            >
              <Plus size={14} />
              新建工作区
            </button>
          </div>
        </>
      ) : null}
      <Dialog open={creating} title="新建工作区" onClose={() => setCreating(false)}>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {EMOJIS.slice(0, 16).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={cn("rounded-md px-1.5 py-1 text-lg", icon === emoji && "bg-black/[0.06]")}
              >
                {emoji}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">名称</span>
            <input
              data-testid="workspace-name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={40}
              autoFocus
              className="w-full rounded-md border border-black/10 px-3 py-2 outline-none focus:border-accent/50"
              placeholder="例如：产品工作台"
            />
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>取消</Button>
            <Button type="submit" data-testid="create-workspace" disabled={pending || !name.trim()}>
              {pending ? "创建中…" : "创建"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
