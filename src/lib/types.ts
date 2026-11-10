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
  "quote",
  "toggle",
  "image",
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]
export type Visibility = "private" | "public"
export type Role = "owner" | "member"
export type CoverId = "" | "warm" | "mist" | "moss" | "ink" | "rose"

export const INLINE_MARKS = ["bold", "italic", "code", "strike"] as const

export type InlineMarkType = (typeof INLINE_MARKS)[number]

export type InlineMark = {
  type: InlineMarkType
  start: number
  end: number
}

export const IMAGE_WIDTHS = ["small", "medium", "large"] as const
export type ImageWidth = (typeof IMAGE_WIDTHS)[number]

export type BlockDTO = {
  id: string
  type: BlockType
  content: string
  checked: boolean
  language: string
  position: number
  marks: InlineMark[]
  parentId: string
  collapsed: boolean
  src: string
  width: "" | ImageWidth
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
