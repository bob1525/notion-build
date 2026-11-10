import Link from "next/link"
import { Button, EmptyState, Logo } from "@/components/ui"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6">
      <Logo />
      <EmptyState
        icon="🍃"
        title="这里什么都没有"
        body="页面不存在，或者你还没有权限打开它。"
        action={<Link href="/"><Button>回到 Folio</Button></Link>}
      />
    </main>
  )
}
