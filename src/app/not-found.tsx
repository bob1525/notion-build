import Link from "next/link"
import { Logo } from "@/components/ui"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold">这里什么都没有</h1>
      <p className="mt-2 text-sm leading-6 text-muted">页面不存在，或者你还没有权限打开它。</p>
      <Link href="/" className="mt-6 rounded-md bg-ink px-3 py-2 text-sm text-white">回到 Folio</Link>
    </main>
  )
}
