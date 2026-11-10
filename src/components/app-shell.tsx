"use client"

import { Menu, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { PageScreen } from "@/components/page-screen"
import { SearchDialog } from "@/components/search-dialog"
import { PageSkeleton } from "@/components/skeletons"
import { Sidebar, useCurrentTitle } from "@/components/sidebar"
import { useWorkspace } from "@/components/workspace-provider"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const title = useCurrentTitle()
  const { creatingPage, openedPage } = useWorkspace()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (event.defaultPrevented) return
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === "Escape") setNavOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden bg-white text-ink">
      {navOpen ? (
        <button className="fixed inset-0 z-30 bg-black/30 md:hidden" aria-label="关闭侧栏" onClick={() => setNavOpen(false)} />
      ) : null}
      <div className={`${navOpen ? "fixed inset-y-0 left-0 z-40 flex shadow-pop" : "hidden"} md:static md:flex md:shadow-none`}>
        <Sidebar onSearch={() => { setSearchOpen(true); setNavOpen(false) }} onNavigate={() => setNavOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b border-black/[0.06] px-3 md:hidden">
          <button type="button" data-testid="nav-toggle" aria-label="打开侧栏" onClick={() => setNavOpen(true)} className="grid h-11 w-11 place-items-center rounded-md hover:bg-black/[0.05]">
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
          <button type="button" data-testid="search-open-mobile" aria-label="搜索" onClick={() => setSearchOpen(true)} className="grid h-11 w-11 place-items-center rounded-md hover:bg-black/[0.05]">
            <Search size={18} />
          </button>
        </header>
        <main className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto">
          {openedPage ? <PageScreen key={openedPage.id} initial={openedPage} /> : children}
          {creatingPage ? (
            <div className="absolute inset-0 z-20 bg-white">
              <PageSkeleton label="正在创建页面" />
            </div>
          ) : null}
        </main>
      </div>
      {searchOpen ? <SearchDialog onClose={() => setSearchOpen(false)} /> : null}
    </div>
  )
}
