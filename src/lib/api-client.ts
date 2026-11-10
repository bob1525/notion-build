export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json")
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(body.error || "请求失败", response.status)
  }
  const body = (await response.json()) as { data: T }
  return body.data
}

export function pagePayload(
  meta: { title: string; icon: string; cover: string; visibility: string; pinned: boolean; revision: number },
  blocks: Array<{
    id: string
    type: string
    content: string
    checked: boolean
    language: string
    marks?: unknown
    parentId?: string
    collapsed?: boolean
    src?: string
    width?: string
  }>,
  options?: { overwrite?: boolean },
) {
  return {
    title: meta.title,
    icon: meta.icon,
    cover: meta.cover,
    visibility: meta.visibility,
    pinned: meta.pinned,
    baseRevision: meta.revision,
    overwrite: options?.overwrite ?? false,
    blocks: blocks.map(({ id, type, content, checked, language, marks, parentId, collapsed, src, width }) => ({
      id,
      type,
      content,
      checked,
      language,
      marks: marks ?? [],
      parentId: parentId ?? "",
      collapsed: Boolean(collapsed),
      src: src ?? "",
      width: width ?? "",
    })),
  }
}
