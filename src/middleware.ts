import { NextResponse, type NextRequest } from "next/server"
import { readSession, SESSION_COOKIE, WORKSPACE_COOKIE } from "@/lib/session"

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const userId = token ? await readSession(token) : null
  if (!userId) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(url)
  }
  const response = NextResponse.next()
  const workspaceId = request.nextUrl.pathname.match(/^\/w\/([^/]+)/)?.[1]
  if (workspaceId) {
    response.cookies.set(WORKSPACE_COOKIE, workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
      secure: process.env.NODE_ENV === "production",
    })
  }
  return response
}

export const config = {
  matcher: ["/w/:path*", "/start"],
}
