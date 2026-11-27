-- 在线状态表。这是 SQLite 写法（DATETIME）。
-- 不要在 PostgreSQL 上执行这份文件。两种数据库都由 prisma db push 按 schema.prisma 建表，
-- 再由 scripts/apply-presence-migration.ts 用对应方言补一次 CREATE TABLE IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS "PagePresence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activity" TEXT NOT NULL,
  "seenAt" DATETIME NOT NULL,
  CONSTRAINT "PagePresence_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PagePresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PagePresence_pageId_userId_key" ON "PagePresence"("pageId", "userId");

CREATE INDEX IF NOT EXISTS "PagePresence_pageId_seenAt_idx" ON "PagePresence"("pageId", "seenAt");
