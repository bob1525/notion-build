import "server-only"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { SESSION_COOKIE, WORKSPACE_COOKIE, signSession } from "@/lib/session"
import type { UserDTO } from "@/lib/types"
import { HttpError } from "@/server/http"

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
}

export async function setSession(userId: string) {
  const token = await signSession(userId)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, { ...cookieBase, maxAge: 60 * 60 * 24 * 30 })
}

export async function clearSession() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

export async function readRememberedWorkspace() {
  const jar = await cookies()
  return jar.get(WORKSPACE_COOKIE)?.value
}

export async function getCurrentUser(): Promise<UserDTO | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  const { readSession } = await import("@/lib/session")
  const userId = await readSession(token)
  if (!userId) return null
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  })
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new HttpError(401, "请先登录")
  return user
}
