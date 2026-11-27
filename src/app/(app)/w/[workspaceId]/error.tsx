"use client"

import { Button, EmptyState } from "@/components/ui"

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon="⚠️"
      title="工作区没有加载出来"
      body="可能是网络抖了一下。重试之后，侧栏和页面会重新取一次。"
      action={<Button onClick={reset}>重试</Button>}
    />
  )
}
