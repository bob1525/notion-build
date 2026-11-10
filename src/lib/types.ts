export const BLOCK_TYPES = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulleted",
  "numbered",
  "todo",
  "code",
  "divider",
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]
export type Visibility = "private" | "public"
export type Role = "owner" | "member"
export type CoverId = "" | "warm" | "mist" | "moss" | "ink" | "rose"

export type BlockDTO = {
  id: string
  type: BlockType
  content: string
  checked: boolean
  language: string
  position: number
}

export type PageMeta = {
  id: string
  title: string
  icon: string
  cover: string
  visibility: Visibility
  pinned: boolean
  position: number
  parentId: string | null
  authorId: string
  workspaceId: string
  updatedAt: string
  createdAt: string
  favorited: boolean
}

export type PageDetail = PageMeta & {
  authorName: string
  blocks: BlockDTO[]
}

export type WorkspaceDTO = {
  id: string
  name: string
  icon: string
  description: string
  role: Role
}

export type UserDTO = {
  id: string
  email: string
  name: string
}

export type SearchMatch = {
  id: string
  title: string
  icon: string
  snippet: string
  match: "title" | "content"
  score: number
  updatedAt: string
}

export type SearchHit = SearchMatch & {
  breadcrumb: string
}

export type EditorResult = {
  blocks: BlockDTO[]
  focusId: string
  caret: number
}
