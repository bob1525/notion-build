import type { Role, Visibility } from "@/lib/types"

type PageAccess = {
  authorId: string
  visibility: Visibility
}

export function isSharedVisibility(visibility: Visibility) {
  return visibility === "public" || visibility === "read"
}

export function canViewPage(userId: string, page: PageAccess) {
  if (page.authorId === userId) return true
  return isSharedVisibility(page.visibility)
}

export function canFindInSearch(userId: string, page: PageAccess) {
  return canViewPage(userId, page)
}

export function canSharePage(page: { visibility: Visibility }) {
  return isSharedVisibility(page.visibility)
}

export function canEditPage(userId: string, page: PageAccess, role?: Role) {
  if (page.authorId === userId) return true
  if (page.visibility === "public") return true
  return role === "owner" && page.visibility === "read"
}

export function canDeletePage(userId: string, role: Role, page: { authorId: string }) {
  return role === "owner" || page.authorId === userId
}

export function canManageVisibility(userId: string, role: Role, page: { authorId: string }) {
  return role === "owner" || page.authorId === userId
}

export function canMovePage(userId: string, role: Role, page: PageAccess) {
  return canViewPage(userId, page) && canManageVisibility(userId, role, page)
}

export function pageSaveError(
  userId: string,
  role: Role,
  current: PageAccess & { pinned: boolean },
  next: { visibility: Visibility; pinned: boolean; contentChanged: boolean },
) {
  if (!canViewPage(userId, current)) return "你没有查看这个页面的权限"
  if (next.contentChanged && !canEditPage(userId, current, role)) return "这篇页面对你是只读的"
  if ((next.visibility !== current.visibility || next.pinned !== current.pinned) && !canManageVisibility(userId, role, current)) {
    return "只有作者或工作区所有者可以修改权限"
  }
  if (!canEditPage(userId, current, role)) return "这篇页面对你是只读的"
  return null
}
