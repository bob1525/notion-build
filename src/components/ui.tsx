"use client"

import { X } from "lucide-react"
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { cn } from "@/lib/cn"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "soft" | "danger"
}

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-ink text-white hover:bg-black",
    ghost: "text-ink hover:bg-black/[0.06]",
    soft: "bg-black/[0.05] text-ink hover:bg-black/[0.08]",
    danger: "bg-danger text-white hover:bg-[#a9443d]",
  }[variant]
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  testId,
}: {
  icon: string
  title: string
  body: string
  action?: React.ReactNode
  testId?: string
}) {
  return (
    <div data-testid={testId} className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sidebar text-[28px] shadow-card">
        {icon}
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button className="absolute inset-0 bg-black/30" aria-label="关闭" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative z-10 w-full max-w-md rounded-xl bg-white p-4 shadow-pop">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭对话框" className="rounded-md p-1 text-muted hover:bg-black/[0.05]">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const ToastContext = createContext<(message: string) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Array<{ id: string; message: string }>>([])
  const push = useCallback((message: string) => {
    const id = crypto.randomUUID()
    setItems((current) => [...current, { id, message }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, 3200)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} data-testid="toast" className="rounded-lg bg-ink px-3 py-2 text-sm text-white shadow-pop">
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-[13px] text-white">F</span>
      Folio
    </span>
  )
}
