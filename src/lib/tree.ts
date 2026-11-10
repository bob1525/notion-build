export type TreeItem = {
  id: string
  parentId: string | null
  pinned: boolean
  position: number
  title: string
}

export type TreeNode<T> = T & { children: TreeNode<T>[] }

export function comparePages<T extends { pinned: boolean; position: number; title: string }>(a: T, b: T) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  if (a.position !== b.position) return a.position - b.position
  return a.title.localeCompare(b.title, "zh")
}

export function buildPageTree<T extends TreeItem>(pages: T[]): TreeNode<T>[] {
  const nodes = new Map<string, TreeNode<T>>()
  for (const page of pages) nodes.set(page.id, { ...page, children: [] })

  const roots: TreeNode<T>[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent && !createsCycle(nodes, node.id, parent.id)) parent.children.push(node)
    else roots.push(node)
  }

  const sortList = (list: TreeNode<T>[]) => {
    list.sort(comparePages)
    for (const item of list) sortList(item.children)
  }
  sortList(roots)
  return roots
}

function createsCycle<T extends TreeItem>(nodes: Map<string, TreeNode<T>>, id: string, parentId: string) {
  let current: string | null = parentId
  const seen = new Set<string>()
  while (current) {
    if (current === id || seen.has(current)) return true
    seen.add(current)
    current = nodes.get(current)?.parentId ?? null
  }
  return false
}

export type PagePlacement = "before" | "after" | "inside"

export const PAGE_MOVE_SELF = "不能把页面拖到自己身上"
export const PAGE_MOVE_DESCENDANT = "不能把页面拖进自己的子页面"

export type PageMoveResult<T> = { ok: true; pages: T[] } | { ok: false; message: string }

export function planPageMove<T extends TreeItem>(
  pages: T[],
  sourceId: string,
  targetId: string,
  placement: PagePlacement,
): PageMoveResult<T> {
  const source = pages.find((page) => page.id === sourceId)
  const target = pages.find((page) => page.id === targetId)
  if (!source || !target) return { ok: false, message: "找不到这个页面" }
  if (sourceId === targetId) return { ok: false, message: PAGE_MOVE_SELF }

  const destinationParent = placement === "inside" ? targetId : target.parentId
  const descendants = new Set(collectDescendantIds(pages, sourceId))
  if (destinationParent && descendants.has(destinationParent)) {
    return { ok: false, message: PAGE_MOVE_DESCENDANT }
  }

  const next = pages.map((page) => ({ ...page }))
  const moved = next.find((page) => page.id === sourceId)
  if (!moved) return { ok: false, message: "找不到这个页面" }
  const previousParent = moved.parentId
  moved.parentId = destinationParent

  const siblings = next
    .filter((page) => page.parentId === destinationParent && page.id !== sourceId)
    .sort(comparePages)
  let insertAt = siblings.length
  if (placement !== "inside") {
    const targetIndex = siblings.findIndex((page) => page.id === targetId)
    insertAt = placement === "before" ? targetIndex : targetIndex + 1
  }
  siblings.splice(clampToPinGroup(siblings, moved, insertAt), 0, moved)
  siblings.forEach((page, index) => {
    page.position = index
  })
  if (previousParent !== destinationParent) {
    next
      .filter((page) => page.parentId === previousParent)
      .sort(comparePages)
      .forEach((page, index) => {
        page.position = index
      })
  }
  return { ok: true, pages: next }
}

function clampToPinGroup<T extends TreeItem>(siblings: T[], source: T, index: number) {
  const unpinnedAt = siblings.findIndex((page) => !page.pinned)
  const start = source.pinned ? 0 : unpinnedAt === -1 ? siblings.length : unpinnedAt
  const end = source.pinned ? (unpinnedAt === -1 ? siblings.length : unpinnedAt) : siblings.length
  return Math.min(Math.max(index, start), end)
}

export function copyTitle(title: string) {
  const base = title.trim() || "未命名"
  return `${base} 副本`
}

export type PlannedPageCopy = {
  sourceId: string
  title: string
  parentSourceId: string | null
}

export function planPageCopy(
  pages: { id: string; parentId: string | null; title: string }[],
  pageId: string,
  includeChildren: boolean,
): { ok: true; copies: PlannedPageCopy[] } | { ok: false; message: string } {
  const source = pages.find((page) => page.id === pageId)
  if (!source) return { ok: false, message: "找不到这个页面" }
  const ids = includeChildren ? collectDescendantIds(pages, pageId) : [pageId]
  const idSet = new Set(ids)
  return {
    ok: true,
    copies: ids.map((id) => {
      const page = pages.find((item) => item.id === id)
      if (!page) return { sourceId: id, title: copyTitle(""), parentSourceId: null }
      return {
        sourceId: id,
        title: id === pageId ? copyTitle(page.title) : page.title,
        parentSourceId: page.parentId && idSet.has(page.parentId) ? page.parentId : null,
      }
    }),
  }
}

export function collectDescendantIds(pages: { id: string; parentId: string | null }[], rootId: string) {
  const ids = [rootId]
  const walk = (id: string) => {
    for (const page of pages) {
      if (page.parentId === id && !ids.includes(page.id)) {
        ids.push(page.id)
        walk(page.id)
      }
    }
  }
  walk(rootId)
  return ids
}

export function breadcrumbTitles(
  pageId: string,
  byId: Map<string, { title: string; parentId: string | null }>,
) {
  const titles: string[] = []
  let parentId = byId.get(pageId)?.parentId ?? null
  const guard = new Set<string>([pageId])
  while (parentId && !guard.has(parentId)) {
    guard.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    titles.unshift(parent.title.trim() || "未命名")
    parentId = parent.parentId
  }
  return titles
}

export function ancestorIds(pageId: string, byId: Map<string, { parentId: string | null }>) {
  const ids: string[] = []
  let parentId = byId.get(pageId)?.parentId ?? null
  const guard = new Set<string>([pageId])
  while (parentId && !guard.has(parentId)) {
    guard.add(parentId)
    ids.push(parentId)
    parentId = byId.get(parentId)?.parentId ?? null
  }
  return ids
}
