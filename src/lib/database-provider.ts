export type DatabaseProvider = "sqlite" | "postgresql"

const SQLITE_DATASOURCE = `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`

export function resolveDatabaseProvider(env: Record<string, string | undefined>): DatabaseProvider {
  const explicit = (env.DATABASE_PROVIDER ?? "").trim().toLowerCase()
  if (explicit === "sqlite") return "sqlite"
  if (explicit === "postgresql" || explicit === "postgres") return "postgresql"
  if (explicit) throw new Error(`未知的数据库：${explicit}。请用 sqlite 或 postgresql。`)
  const url = (env.DATABASE_URL ?? "").trim().toLowerCase()
  if (url.startsWith("postgresql://") || url.startsWith("postgres://")) return "postgresql"
  return "sqlite"
}

export function parseDotEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed
    const eq = body.indexOf("=")
    if (eq <= 0) continue
    const key = body.slice(0, eq).trim()
    let value = body.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    } else {
      const comment = value.search(/\s+#/)
      if (comment >= 0) value = value.slice(0, comment).trim()
    }
    if (key) result[key] = value
  }
  return result
}

export function mergeEnv(base: Record<string, string | undefined>, file: Record<string, string>) {
  const next = { ...base }
  for (const [key, value] of Object.entries(file)) {
    if (next[key] === undefined) next[key] = value
  }
  return next
}

export function renderPrismaSchema(
  source: string,
  provider: DatabaseProvider,
  options?: { directUrl?: boolean },
) {
  if (!source.includes(SQLITE_DATASOURCE)) {
    throw new Error("schema.prisma 的 datasource 不是预期的 sqlite 块，无法切换。")
  }
  if (provider === "sqlite") return source
  const direct = options?.directUrl ? `\n  directUrl = env("DIRECT_URL")` : ""
  const next = `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")${direct}
}`
  return source.replace(SQLITE_DATASOURCE, next)
}

export function resetStatements(provider: DatabaseProvider) {
  if (provider === "sqlite") {
    return [
      "PRAGMA foreign_keys = OFF",
      'DELETE FROM "Favorite"',
      'DELETE FROM "Block"',
      'DELETE FROM "PageSnapshot"',
      'DELETE FROM "Page"',
      'DELETE FROM "WorkspaceMember"',
      'DELETE FROM "Workspace"',
      'DELETE FROM "User"',
      "PRAGMA foreign_keys = ON",
    ]
  }
  return [
    'DELETE FROM "Favorite"',
    'DELETE FROM "Block"',
    'DELETE FROM "PageSnapshot"',
    'DELETE FROM "Page"',
    'DELETE FROM "UserPreference"',
    'DELETE FROM "WorkspaceMember"',
    'DELETE FROM "Workspace"',
    'DELETE FROM "User"',
  ]
}

export function pageHistoryStatements(provider: DatabaseProvider) {
  const timestamp = provider === "postgresql" ? "TIMESTAMP(3)" : "DATETIME"
  return [
    `CREATE TABLE IF NOT EXISTS "PageSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pageId" TEXT NOT NULL,
  "editorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "cover" TEXT NOT NULL,
  "blocks" TEXT NOT NULL,
  "createdAt" ${timestamp} NOT NULL,
  "updatedAt" ${timestamp} NOT NULL,
  CONSTRAINT "PageSnapshot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PageSnapshot_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
    `CREATE INDEX IF NOT EXISTS "PageSnapshot_pageId_updatedAt_idx" ON "PageSnapshot"("pageId", "updatedAt")`,
  ]
}
