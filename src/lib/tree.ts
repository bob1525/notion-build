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
