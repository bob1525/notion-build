import type { Role, Visibility } from "@/lib/types"

type PageAccess = {
  authorId: string
  visibility: Visibility
}

export function canViewPage(userId: string, page: PageAccess) {
  if (page.visibility === "public") return true
  return page.authorId === userId
}

export function canEditPage(userId: string, page: PageAccess) {
  return canViewPage(userId, page)
}

export function canDeletePage(userId: string, role: Role, page: { authorId: string }) {
  return role === "owner" || page.authorId === userId
}

export function canManageVisibility(userId: string, role: Role, page: { authorId: string }) {
  return role === "owner" || page.authorId === userId
}
