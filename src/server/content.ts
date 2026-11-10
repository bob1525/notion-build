import "server-only"
import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { blockInputSchema, normalizeBlocks } from "@/lib/blocks"
import { normalizeMarks } from "@/lib/rich-text"
import type { InlineMark } from "@/lib/types"
import { prisma } from "@/lib/db"
import { asBlockType, asCover, asRole, asVisibility, clampIcon, cleanTitle, displayTitle, pickWorkspaceId } from "@/lib/format"
import { canDeletePage, canEditPage, canFindInSearch, canManageVisibility, canSharePage, canViewPage } from "@/lib/permissions"
import { searchPages, type SearchScope } from "@/lib/search"
import { breadcrumbTitles, planPageCopy, planPageMove } from "@/lib/tree"
import type { BlockDTO, PageDetail, PageMeta, SearchHit, UserDTO, WorkspaceDTO } from "@/lib/types"
import { readRememberedWorkspace } from "@/server/auth"
import { ConflictError, HttpError } from "@/server/http"
import type { Page } from "@prisma/client"

export const registerSchema = z.object({
  name: z.string().trim().min(1, "请填写名字").max(40, "名字太长了"),
  email: z.string().trim().email("邮箱格式不正确").max(120),
  password: z.string().min(8, "密码至少 8 位").max(72, "密码太长了"),
})

export const loginSchema = z.object({
  email: z.string().trim().email("邮箱格式不正确"),
  password: z.string().min(1, "请填写密码"),
})

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "请填写工作区名称").max(40, "名称太长了"),
  icon: z.string().max(32).optional(),
  description: z.string().max(200).optional(),
})

export const createPageSchema = z.object({
  title: z.string().max(200).optional(),
  parentId: z.string().nullable().optional(),
  icon: z.string().max(32).optional(),
})

export const movePageSchema = z.object({
  pageId: z.string().min(1),
  targetId: z.string().min(1),
  placement: z.enum(["before", "after", "inside"]),
})

export const duplicatePageSchema = z.object({
  includeChildren: z.boolean(),
})

export const updatePageSchema = z.object({
  title: z.string().max(200),
  icon: z.string().max(32),
  cover: z.string().max(20),
  visibility: z.enum(["private", "public"]),
  pinned: z.boolean(),
  blocks: z.array(blockInputSchema).max(400),
  baseRevision: z.number().int().nonnegative(),
  overwrite: z.boolean().optional().default(false),
})

function readMarks(value: string, content: string): InlineMark[] {
  try {
    const parsed = JSON.parse(value) as InlineMark[]
    if (!Array.isArray(parsed)) return []
    return normalizeMarks(content, parsed)
  } catch {
    return []
  }
}

function toBlock(block: {
  id: string
  type: string
  content: string
  marks: string
  checked: boolean
  language: string
  parentId: string
  collapsed: boolean
  src: string
  width: string
  position: number
}): BlockDTO {
  const type = asBlockType(block.type)
  const content = type === "divider" ? "" : block.content
  const width = block.width === "small" || block.width === "medium" || block.width === "large" ? block.width : ""
  return {
    id: block.id,
    type,
    content,
    checked: type === "todo" ? block.checked : false,
    language: type === "code" ? block.language.trim().toLowerCase() : "",
    position: block.position,
    marks: type === "divider" || type === "code" || type === "image" ? [] : readMarks(block.marks ?? "[]", content),
    parentId: block.parentId ?? "",
    collapsed: type === "toggle" ? Boolean(block.collapsed) : false,
    src: type === "image" ? (block.src ?? "") : "",
    width: type === "image" ? width || "medium" : "",
  }
}

function toPageMeta(page: Page, favorited: boolean): PageMeta {
  return {
    id: page.id,
    title: page.title,
    icon: page.icon || "📄",
    cover: asCover(page.cover),
    visibility: asVisibility(page.visibility),
    pinned: page.pinned,
    position: page.position,
    parentId: page.parentId,
    authorId: page.authorId,
    workspaceId: page.workspaceId,
    updatedAt: page.updatedAt.toISOString(),
    createdAt: page.createdAt.toISOString(),
    favorited,
  }
}

export async function listWorkspaces(userId: string): Promise<WorkspaceDTO[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  })
  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    icon: membership.workspace.icon,
    description: membership.workspace.description,
    role: asRole(membership.role),
  }))
}

export async function getHomeWorkspaceId(userId: string) {
  const workspaces = await listWorkspaces(userId)
  return pickWorkspaceId(await readRememberedWorkspace(), workspaces)
}

export async function getWorkspaceBundle(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    include: { workspace: true },
  })
  if (!membership) return null
  const pages = await prisma.page.findMany({
    where: { workspaceId },
    include: { favorites: { where: { userId }, select: { id: true } } },
    orderBy: [{ position: "asc" }, { title: "asc" }],
  })
  return {
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      icon: membership.workspace.icon,
      description: membership.workspace.description,
      role: asRole(membership.role),
    } satisfies WorkspaceDTO,
    workspaces: await listWorkspaces(userId),
    pages: pages.filter((page) => canViewPage(userId, { ...page, visibility: asVisibility(page.visibility) })).map((page) =>
      toPageMeta(page, page.favorites.length > 0),
    ),
  }
}

export async function loadPageDetail(
  userId: string,
  pageId: string,
): Promise<{ kind: "ok"; page: PageDetail; role: WorkspaceDTO["role"] } | { kind: "missing" } | { kind: "forbidden" }> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      author: { select: { name: true } },
      blocks: { orderBy: { position: "asc" } },
      favorites: { where: { userId }, select: { id: true } },
    },
  })
  if (!page) return { kind: "missing" }
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: page.workspaceId } },
  })
  if (!membership) return { kind: "missing" }
  const visibility = asVisibility(page.visibility)
  if (!canViewPage(userId, { authorId: page.authorId, visibility })) return { kind: "forbidden" }
  return {
    kind: "ok",
    role: asRole(membership.role),
    page: {
      ...toPageMeta(page, page.favorites.length > 0),
      authorName: page.author.name,
      blocks: page.blocks.map(toBlock),
      revision: page.revision,
    },
  }
}

export async function searchWorkspace(userId: string, workspaceId: string, query: string, scope: SearchScope = "all"): Promise<SearchHit[]> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  })
  if (!membership) throw new HttpError(404, "找不到这个工作区")
  const pages = await prisma.page.findMany({
    where: { workspaceId },
    include: { blocks: { select: { content: true }, orderBy: { position: "asc" } } },
  })
  const visible = pages.filter((page) => canFindInSearch(userId, { authorId: page.authorId, visibility: asVisibility(page.visibility) }))
  const matches = searchPages(
    visible.map((page) => ({
      id: page.id,
      title: displayTitle(page.title),
      icon: page.icon,
      updatedAt: page.updatedAt.toISOString(),
      blocks: page.blocks,
    })),
    query,
    20,
    scope,
  )
  const byId = new Map(visible.map((page) => [page.id, page]))
  return matches.map((match) => ({
    ...match,
    breadcrumb: breadcrumbTitles(match.id, byId).join(" / "),
  }))
}

async function createWorkspaceRecord(userId: string, input: { name: string; icon?: string; description?: string }) {
  return prisma.workspace.create({
    data: {
      name: input.name.trim(),
      icon: clampIcon(input.icon, "🏠"),
      description: (input.description ?? "").trim(),
      members: { create: { userId, role: "owner" } },
    },
  })
}

export async function registerUser(input: z.infer<typeof registerSchema>) {
  const email = input.email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new HttpError(409, "该邮箱已注册")
  const passwordHash = await bcrypt.hash(input.password, 10)
  const user = await prisma.user.create({
    data: { name: input.name.trim(), email, passwordHash },
  })
  const workspace = await createWorkspaceRecord(user.id, {
    name: `${user.name} 的空间`,
    icon: "🌱",
    description: "刚创建的个人工作区",
  })
  await prisma.page.create({
    data: {
      title: "开始使用",
      icon: "📘",
      cover: "mist",
      visibility: "public",
      pinned: true,
      workspaceId: workspace.id,
      authorId: user.id,
      blocks: {
        create: [
          { type: "paragraph", content: "这是你的第一篇页面。直接写下去，或键入 / 插入标题、列表、待办和代码。", position: 0 },
          { type: "todo", content: "把标题改成自己的题目", checked: false, position: 1 },
          { type: "todo", content: "建一个子页面，把笔记分层", checked: false, position: 2 },
        ],
      },
    },
  })
  const account: UserDTO = { id: user.id, email: user.email, name: user.name }
  return { user: account, workspaceId: workspace.id }
}

export async function loginUser(input: z.infer<typeof loginSchema>) {
  const email = input.email.toLowerCase()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "邮箱或密码不正确")
  }
  const workspaces = await listWorkspaces(user.id)
  return {
    user: { id: user.id, email: user.email, name: user.name } satisfies UserDTO,
    workspaceId: workspaces[0]?.id ?? null,
  }
}

export async function createWorkspace(userId: string, input: z.infer<typeof createWorkspaceSchema>) {
  const workspace = await createWorkspaceRecord(userId, input)
  return {
    id: workspace.id,
    name: workspace.name,
    icon: workspace.icon,
    description: workspace.description,
    role: "owner" as const,
  } satisfies WorkspaceDTO
}

export async function createPage(userId: string, workspaceId: string, input: z.infer<typeof createPageSchema>) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  })
  if (!membership) throw new HttpError(404, "找不到这个工作区")
  const parentId = input.parentId || null
  if (parentId) {
    const parent = await loadPageDetail(userId, parentId)
    if (parent.kind !== "ok" || parent.page.workspaceId !== workspaceId) {
      throw new HttpError(400, "无法在这个页面下创建子页面")
    }
  }
  const aggregate = await prisma.page.aggregate({
    where: { workspaceId, parentId },
    _max: { position: true },
  })
  const page = await prisma.page.create({
    data: {
      title: cleanTitle(input.title ?? ""),
      icon: clampIcon(input.icon, "📄"),
      visibility: "private",
      cover: "",
      position: (aggregate._max.position ?? -1) + 1,
      workspaceId,
      parentId,
      authorId: userId,
      blocks: { create: [{ type: "paragraph", content: "", position: 0 }] },
    },
  })
  return toPageMeta(page, false)
}

export async function updatePage(userId: string, pageId: string, input: z.infer<typeof updatePageSchema>) {
  const loaded = await loadPageDetail(userId, pageId)
  if (loaded.kind === "missing") throw new HttpError(404, "找不到这个页面")
  if (loaded.kind === "forbidden") throw new HttpError(403, "你没有编辑这个页面的权限")
  if (input.visibility !== loaded.page.visibility && !canManageVisibility(userId, loaded.role, loaded.page)) {
    throw new HttpError(403, "只有作者或工作区所有者可以修改可见性")
  }
  const blocks = normalizeBlocks(input.blocks)
  let conflicted = false
  await prisma.$transaction(async (tx) => {
    const gate = await tx.page.updateMany({
      where: input.overwrite ? { id: pageId } : { id: pageId, revision: input.baseRevision },
      data: {
        title: cleanTitle(input.title),
        icon: clampIcon(input.icon, "📄"),
        cover: asCover(input.cover),
        visibility: input.visibility,
        pinned: input.pinned,
        revision: { increment: 1 },
      },
    })
    if (gate.count !== 1) {
      conflicted = true
      return
    }
    await tx.block.deleteMany({ where: { pageId } })
    if (blocks.length) {
      await tx.block.createMany({
        data: blocks.map((block) => ({
          id: block.id,
          pageId,
          type: block.type,
          content: block.content,
          checked: block.checked,
          language: block.language,
          marks: JSON.stringify(block.marks ?? []),
          parentId: block.parentId ?? "",
          collapsed: block.collapsed ?? false,
          src: block.src ?? "",
          width: block.width ?? "",
          position: block.position,
        })),
      })
    }
  })
  if (conflicted) {
    const latest = await loadPageDetail(userId, pageId)
    if (latest.kind === "missing") throw new HttpError(404, "找不到这个页面")
    if (latest.kind !== "ok") throw new HttpError(403, "你没有编辑这个页面的权限")
    throw new ConflictError(latest.page)
  }
  const refreshed = await loadPageDetail(userId, pageId)
  if (refreshed.kind !== "ok") throw new HttpError(500, "保存后没有读到页面")
  return refreshed.page
}

export async function moveWorkspacePage(userId: string, workspaceId: string, input: z.infer<typeof movePageSchema>) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  })
  if (!membership) throw new HttpError(404, "找不到这个工作区")
  const records = await prisma.page.findMany({ where: { workspaceId } })
  const source = records.find((page) => page.id === input.pageId)
  const target = records.find((page) => page.id === input.targetId)
  if (!source) throw new HttpError(404, "找不到这个页面")
  if (!target) throw new HttpError(400, "找不到目标页面")
  if (!canEditPage(userId, { authorId: source.authorId, visibility: asVisibility(source.visibility) })) {
    throw new HttpError(403, "你没有移动这个页面的权限")
  }
  if (!canViewPage(userId, { authorId: target.authorId, visibility: asVisibility(target.visibility) })) {
    throw new HttpError(403, "你没有把页面拖到这里的权限")
  }
  const plan = planPageMove(
    records.map((page) => ({
      id: page.id,
      parentId: page.parentId,
      pinned: page.pinned,
      position: page.position,
      title: page.title,
    })),
    input.pageId,
    input.targetId,
    input.placement,
  )
  if (!plan.ok) throw new HttpError(400, plan.message)
  const current = new Map(records.map((page) => [page.id, page]))
  const changed = plan.pages.filter((page) => {
    const previous = current.get(page.id)
    return previous && (previous.parentId !== page.parentId || previous.position !== page.position)
  })
  if (changed.length) {
    await prisma.$transaction(
      changed.map((page) =>
        prisma.page.update({
          where: { id: page.id },
          data: { parentId: page.parentId, position: page.position },
        }),
      ),
    )
  }
  return visiblePageMetas(userId, workspaceId)
}

export async function duplicatePage(userId: string, pageId: string, includeChildren: boolean) {
  const loaded = await loadPageDetail(userId, pageId)
  if (loaded.kind === "missing") throw new HttpError(404, "找不到这个页面")
  if (loaded.kind === "forbidden") throw new HttpError(403, "你没有复制这个页面的权限")
  const workspaceId = loaded.page.workspaceId
  const records = await prisma.page.findMany({ where: { workspaceId } })
  const visible = records.filter((page) =>
    canViewPage(userId, { authorId: page.authorId, visibility: asVisibility(page.visibility) }),
  )
  const plan = planPageCopy(
    visible.map((page) => ({ id: page.id, parentId: page.parentId, title: page.title })),
    pageId,
    includeChildren,
  )
  if (!plan.ok) throw new HttpError(400, plan.message)
  const byId = new Map(records.map((page) => [page.id, page]))
  const root = byId.get(pageId)
  if (!root) throw new HttpError(404, "找不到这个页面")
  const rootPosition = records.filter((page) => page.parentId === root.parentId).reduce((max, page) => Math.max(max, page.position), -1) + 1
  const blocks = await prisma.block.findMany({
    where: { pageId: { in: plan.copies.map((copy) => copy.sourceId) } },
    orderBy: { position: "asc" },
  })
  const idMap = new Map<string, string>()
  const createdIds: string[] = []
  await prisma.$transaction(async (tx) => {
    for (const copy of plan.copies) {
      const source = byId.get(copy.sourceId)
      if (!source) throw new HttpError(404, "找不到这个页面")
      const created = await tx.page.create({
        data: {
          title: copy.title,
          icon: source.icon,
          cover: source.cover,
          visibility: "private",
          pinned: false,
          position: copy.sourceId === pageId ? rootPosition : source.position,
          workspaceId,
          parentId: copy.parentSourceId ? idMap.get(copy.parentSourceId) ?? null : source.parentId,
          authorId: userId,
        },
      })
      idMap.set(copy.sourceId, created.id)
      createdIds.push(created.id)
      const pageBlocks = blocks.filter((block) => block.pageId === copy.sourceId)
      const blockIds = new Map(pageBlocks.map((block) => [block.id, randomUUID()]))
      if (pageBlocks.length) {
        await tx.block.createMany({
          data: pageBlocks.map((block) => ({
            id: blockIds.get(block.id) ?? randomUUID(),
            pageId: created.id,
            type: block.type,
            content: block.content,
            checked: block.checked,
            language: block.language,
            marks: block.marks,
            parentId: block.parentId && blockIds.has(block.parentId) ? blockIds.get(block.parentId) ?? "" : "",
            collapsed: block.collapsed,
            src: block.src,
            width: block.width,
            position: block.position,
          })),
        })
      }
    }
  })
  const created = await prisma.page.findMany({
    where: { id: { in: createdIds } },
    include: { favorites: { where: { userId }, select: { id: true } } },
  })
  const order = new Map(createdIds.map((id, index) => [id, index]))
  created.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
  return {
    rootId: idMap.get(pageId) ?? createdIds[0],
    pages: created.map((page) => toPageMeta(page, page.favorites.length > 0)),
  }
}

async function visiblePageMetas(userId: string, workspaceId: string) {
  const pages = await prisma.page.findMany({
    where: { workspaceId },
    include: { favorites: { where: { userId }, select: { id: true } } },
    orderBy: [{ position: "asc" }, { title: "asc" }],
  })
  return pages
    .filter((page) => canViewPage(userId, { authorId: page.authorId, visibility: asVisibility(page.visibility) }))
    .map((page) => toPageMeta(page, page.favorites.length > 0))
}

export async function deletePage(userId: string, pageId: string) {
  const loaded = await loadPageDetail(userId, pageId)
  if (loaded.kind === "missing") throw new HttpError(404, "找不到这个页面")
  if (loaded.kind === "forbidden") throw new HttpError(403, "你没有删除这个页面的权限")
  if (!canDeletePage(userId, loaded.role, loaded.page)) throw new HttpError(403, "你没有删除这个页面的权限")
  await prisma.page.delete({ where: { id: pageId } })
  return { id: pageId }
}

export async function setFavorite(userId: string, pageId: string, favorited: boolean) {
  const loaded = await loadPageDetail(userId, pageId)
  if (loaded.kind === "missing") throw new HttpError(404, "找不到这个页面")
  if (loaded.kind === "forbidden") throw new HttpError(403, "你没有收藏这个页面的权限")
  if (favorited) {
    await prisma.favorite.upsert({
      where: { userId_pageId: { userId, pageId } },
      update: {},
      create: { userId, pageId },
    })
  } else {
    await prisma.favorite.deleteMany({ where: { userId, pageId } })
  }
  const refreshed = await loadPageDetail(userId, pageId)
  if (refreshed.kind !== "ok") throw new HttpError(500, "收藏状态没有更新")
  const { blocks: _blocks, authorName: _authorName, revision: _revision, ...meta } = refreshed.page
  return meta
}

export async function loadPublicPage(pageId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      author: { select: { name: true } },
      workspace: { select: { id: true, name: true, icon: true } },
      blocks: { orderBy: { position: "asc" } },
    },
  })
  if (!page || !canSharePage({ visibility: asVisibility(page.visibility) })) return null
  return {
    id: page.id,
    title: displayTitle(page.title),
    icon: page.icon,
    cover: asCover(page.cover),
    updatedAt: page.updatedAt.toISOString(),
    authorName: page.author.name,
    workspace: page.workspace,
    blocks: page.blocks.map(toBlock),
  }
}
