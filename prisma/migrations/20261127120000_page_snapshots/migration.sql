-- 页面历史表。这是 SQLite 写法（DATETIME）。
-- 不要在 PostgreSQL 上执行这份文件。两种数据库都由 prisma db push 按 schema.prisma 建表，
-- 再由 scripts/apply-page-history-migration.ts 用对应方言补一次 CREATE TABLE IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS "PageSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pageId" TEXT NOT NULL,
  "editorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "cover" TEXT NOT NULL,
  "blocks" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PageSnapshot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PageSnapshot_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PageSnapshot_pageId_updatedAt_idx" ON "PageSnapshot"("pageId", "updatedAt");
