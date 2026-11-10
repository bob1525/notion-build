"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, Logo } from "@/components/ui"
import { ApiError, api } from "@/lib/api-client"
import { DEMO_USERS } from "@/lib/demo-accounts"
import { safeNextPath } from "@/lib/format"

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const isLogin = mode === "login"

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const path = isLogin ? "/api/auth/login" : "/api/auth/register"
      const body = isLogin ? { email, password } : { name, email, password }
      const result = await api<{ workspaceId: string | null }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      })
      const next = new URLSearchParams(window.location.search).get("next")
      const fallback = result.workspaceId ? `/w/${result.workspaceId}` : "/start"
      router.push(safeNextPath(next, fallback))
      router.refresh()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "没有完成，请再试一次")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden flex-col justify-between bg-sidebar px-12 py-10 lg:flex">
        <Logo />
        <div>
          <p className="max-w-md text-4xl font-semibold leading-tight tracking-tight">一个安静的地方，把想法按页收好。</p>
          <div className="mt-8 max-w-sm rounded-xl bg-white p-5 shadow-card">
            <div className="text-2xl">✨</div>
            <div className="mt-2 text-xl font-semibold">欢迎来到 Folio</div>
            <p className="mt-2 text-sm leading-6 text-muted">用块来写。标题、列表、待办和代码待在同一页里，层级留在左边。</p>
            <ul className="mt-3 space-y-1 text-sm">
              <li>• 多个工作区，随时切换</li>
              <li>• 子页面嵌套成树</li>
              <li>☐ 公开给同事，私有留给自己</li>
            </ul>
          </div>
        </div>
        <p className="text-sm text-muted">块编辑 · Markdown · 搜索 · 收藏与置顶</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{isLogin ? "登录 Folio" : "创建账号"}</h1>
          <p className="mt-2 text-sm text-muted">{isLogin ? "继续写你留下的页面。" : "注册后会给你一个放得下第一篇笔记的空间。"}</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            {isLogin ? null : (
              <Field label="名字" testId="register-name" value={name} onChange={setName} autoComplete="name" placeholder="怎么称呼你" />
            )}
            <Field
              label="邮箱"
              testId={isLogin ? "login-email" : "register-email"}
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Field
              label="密码"
              testId={isLogin ? "login-password" : "register-password"}
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder={isLogin ? "输入密码" : "至少 8 位"}
            />
            {error ? (
              <p data-testid={isLogin ? "login-error" : "register-error"} className="rounded-md bg-red-50 px-3 py-2 text-sm leading-6 text-danger">
                {error}
              </p>
            ) : null}
            <Button type="submit" data-testid={isLogin ? "login-submit" : "register-submit"} className="w-full" disabled={pending}>
              {pending ? "请稍候…" : isLogin ? "登录" : "注册并进入"}
            </Button>
          </form>
          {isLogin ? (
            <button
              type="button"
              data-testid="fill-demo"
              onClick={() => {
                setEmail(DEMO_USERS.nash.email)
                setPassword(DEMO_USERS.nash.password)
              }}
              className="mt-3 w-full rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-muted hover:bg-sidebar"
            >
              填入演示账号 {DEMO_USERS.nash.email}
            </button>
          ) : null}
          <p className="mt-6 text-sm text-muted">
            {isLogin ? "还没有账号？" : "已经有账号？"}{" "}
            <Link href={isLogin ? "/register" : "/login"} className="font-medium text-ink underline-offset-2 hover:underline">
              {isLogin ? "注册" : "登录"}
            </Link>
          </p>
          {isLogin ? <p className="mt-3 text-xs leading-5 text-faint">另一位成员是 {DEMO_USERS.mia.email}，密码同为 {DEMO_USERS.mia.password}。</p> : null}
        </div>
      </section>
    </div>
  )
}

function Field({
  label,
  testId,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: {
  label: string
  testId: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  placeholder?: string
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        data-testid={testId}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="w-full rounded-md border border-black/10 bg-white px-3 py-2 outline-none focus:border-ink/30"
      />
    </label>
  )
}
