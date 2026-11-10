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
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json")
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(body.error || "请求失败", response.status)
  }
  const body = (await response.json()) as { data: T }
  return body.data
}

export function pagePayload(
  meta: { title: string; icon: string; cover: string; visibility: string; pinned: boolean },
  blocks: Array<{ id: string; type: string; content: string; checked: boolean; language: string; marks?: unknown }>,
) {
  return {
    title: meta.title,
    icon: meta.icon,
    cover: meta.cover,
    visibility: meta.visibility,
    pinned: meta.pinned,
    blocks: blocks.map(({ id, type, content, checked, language, marks }) => ({
      id,
      type,
      content,
      checked,
      language,
      marks: marks ?? [],
    })),
  }
}
