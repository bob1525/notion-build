"use client"

import { usePathname, useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useToast } from "@/components/ui"
import { ApiError, api } from "@/lib/api-client"
import { ensureBlocks } from "@/lib/blocks"
import { buildPageTree } from "@/lib/tree"
import type { PageDetail, PageMeta, UserDTO, WorkspaceDTO } from "@/lib/types"

type WorkspaceContextValue = {
  user: UserDTO
  workspaces: WorkspaceDTO[]
  workspace: WorkspaceDTO
  pages: PageMeta[]
  tree: ReturnType<typeof buildPageTree<PageMeta>>
  favorites: PageMeta[]
  creatingPage: boolean
  openedPage: PageDetail | null
  upsertPage: (page: PageMeta) => void
  removePageTree: (id: string) => void
  createPage: (input?: { parentId?: string | null; title?: string }) => Promise<PageMeta | null>
  movePage: (input: { pageId: string; targetId: string; placement: "before" | "after" | "inside" }) => Promise<boolean>
  duplicatePage: (pageId: string, includeChildren: boolean) => Promise<string | null>
  createWorkspace: (input: { name: string; icon: string; description?: string }) => Promise<WorkspaceDTO>
}

function blankPage(page: PageMeta, authorName: string): PageDetail {
  return { ...page, authorName, blocks: ensureBlocks([], page.id), revision: 0 }
}

function pageTreeIds(pages: PageMeta[], rootId: string) {
  const ids = new Set<string>()
  const walk = (pageId: string) => {
    ids.add(pageId)
    for (const page of pages) {
      if (page.parentId === pageId && !ids.has(page.id)) walk(page.id)
    }
  }
  walk(rootId)
  return ids
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  user,
  workspaces: initialWorkspaces,
  workspace,
  pages: initialPages,
  children,
}: {
  user: UserDTO
  workspaces: WorkspaceDTO[]
  workspace: WorkspaceDTO
  pages: PageMeta[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [pages, setPages] = useState(initialPages)
  const [creatingPage, setCreatingPage] = useState(false)
  const [openedPage, setOpenedPage] = useState<PageDetail | null>(null)
  const creatingLock = useRef(false)
  const openedFrom = useRef<string | null>(null)
  const openedLanded = useRef(false)
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const tree = useMemo(() => buildPageTree(pages), [pages])
  const favorites = useMemo(
    () => pages.filter((page) => page.favorited).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [pages],
  )

  const upsertPage = useCallback((page: PageMeta) => {
    setPages((current) => {
      const index = current.findIndex((item) => item.id === page.id)
      if (index === -1) return [...current, page]
      const next = [...current]
      next[index] = page
      return next
    })
  }, [])

  const removePageTree = useCallback((id: string) => {
    const ids = pageTreeIds(pagesRef.current, id)
    setPages((current) => current.filter((page) => !ids.has(page.id)))
    setOpenedPage((opened) => (opened && ids.has(opened.id) ? null : opened))
  }, [])

  useEffect(() => {
    if (!openedPage) {
      openedLanded.current = false
      openedFrom.current = null
      return
    }
    if (pathname.includes(`/p/${openedPage.id}`)) {
      openedLanded.current = true
      return
    }
    if (openedLanded.current || (openedFrom.current !== null && pathname !== openedFrom.current)) {
      setOpenedPage(null)
    }
  }, [openedPage, pathname])

  const createPage = useCallback(
    async (input?: { parentId?: string | null; title?: string }) => {
      if (creatingLock.current) return null
      creatingLock.current = true
      const from = pathname
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      setCreatingPage(true)
      try {
        const page = await api<PageMeta>(`/api/workspaces/${workspace.id}/pages`, {
          method: "POST",
          body: JSON.stringify({ parentId: input?.parentId ?? null, title: input?.title ?? "" }),
        })
        upsertPage(page)
        openedFrom.current = from
        openedLanded.current = false
        setOpenedPage(blankPage(page, user.name))
        router.push(`/w/${workspace.id}/p/${page.id}`)
        return page
      } catch (error) {
        toast(error instanceof ApiError ? error.message : "没有创建页面")
        return null
      } finally {
        creatingLock.current = false
        setCreatingPage(false)
      }
    },
    [pathname, router, toast, upsertPage, user.name, workspace.id],
  )

  const movePage = useCallback(
    async (input: { pageId: string; targetId: string; placement: "before" | "after" | "inside" }) => {
      try {
        const next = await api<PageMeta[]>(`/api/workspaces/${workspace.id}/pages/move`, {
          method: "POST",
          body: JSON.stringify(input),
        })
        setPages(next)
        return true
      } catch (error) {
        toast(error instanceof ApiError ? error.message : "没有移动页面")
        return false
      }
    },
    [toast, workspace.id],
  )

  const duplicatePage = useCallback(
    async (pageId: string, includeChildren: boolean) => {
      try {
        const created = await api<{ rootId: string; pages: PageMeta[] }>(`/api/pages/${pageId}/duplicate`, {
          method: "POST",
          body: JSON.stringify({ includeChildren }),
        })
        setPages((current) => {
          const merged = new Map(current.map((page) => [page.id, page]))
          for (const page of created.pages) merged.set(page.id, page)
          return [...merged.values()]
        })
        router.push(`/w/${workspace.id}/p/${created.rootId}`)
        return created.rootId
      } catch (error) {
        toast(error instanceof ApiError ? error.message : "没有复制页面")
        return null
      }
    },
    [router, toast, workspace.id],
  )

  const createWorkspace = useCallback(
    async (input: { name: string; icon: string; description?: string }) => {
      const created = await api<WorkspaceDTO>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify(input),
      })
      setWorkspaces((current) => [...current, created])
      router.push(`/w/${created.id}`)
      router.refresh()
      return created
    },
    [router],
  )

  const value = {
    user,
    workspaces,
    workspace,
    pages,
    tree,
    favorites,
    creatingPage,
    openedPage,
    upsertPage,
    removePageTree,
    createPage,
    movePage,
    duplicatePage,
    createWorkspace,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error("WorkspaceProvider is missing")
  return value
}
