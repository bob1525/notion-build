import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE = "folio_session"
export const WORKSPACE_COOKIE = "folio_last_workspace"
const SESSION_TTL = "30d"

function secret() {
  const value = process.env.AUTH_SECRET
  if (!value || value.length < 16) throw new Error("AUTH_SECRET is missing")
  return new TextEncoder().encode(value)
}

export async function signSession(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret())
}

export async function readSession(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret())
    return typeof payload.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}
