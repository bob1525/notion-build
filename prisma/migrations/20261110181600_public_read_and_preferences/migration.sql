-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "sidebar" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 旧的 public 就是「公开可编辑」：工作区成员可以改正文。保留这个值，不把已有页面降成只读。
-- edit / editable 收成 public。只读别名收成 read。
UPDATE "Page" SET "visibility" = 'public' WHERE "visibility" IN ('edit', 'editable');
UPDATE "Page" SET "visibility" = 'read' WHERE "visibility" IN ('readonly', 'public-read', 'public_read');
