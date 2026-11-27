import Link from "next/link"

export default function WorkspaceNotFound() {
  return (
    <div className="px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">找不到这个页面</h1>
      <p className="mt-2 text-sm text-muted">它可能已被删除，或者不在当前工作区里。</p>
      <Link href="/" className="mt-5 inline-block text-sm underline">回到首页</Link>
    </div>
  )
}
