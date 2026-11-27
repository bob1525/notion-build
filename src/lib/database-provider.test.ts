import fs from "node:fs"
import { describe, expect, it } from "vitest"
import {
  mergeEnv,
  parseDotEnv,
  pageHistoryStatements,
  presenceStatements,
  renderPrismaSchema,
  resetStatements,
  resolveDatabaseProvider,
} from "./database-provider"

const schema = fs.readFileSync("prisma/schema.prisma", "utf8")

describe("resolveDatabaseProvider", () => {
  it("keeps the local file database when no provider is set", () => {
    expect(resolveDatabaseProvider({ DATABASE_URL: "file:./dev.db" })).toBe("sqlite")
    expect(resolveDatabaseProvider({})).toBe("sqlite")
    expect(resolveDatabaseProvider({ DATABASE_URL: "" })).toBe("sqlite")
  })

  it("selects postgresql from either url scheme", () => {
    expect(resolveDatabaseProvider({ DATABASE_URL: "postgresql://folio:folio@127.0.0.1:5432/folio" })).toBe("postgresql")
    expect(resolveDatabaseProvider({ DATABASE_URL: "postgres://folio:folio@localhost/folio?sslmode=require" })).toBe(
      "postgresql",
    )
  })

  it("lets DATABASE_PROVIDER override the url", () => {
    expect(resolveDatabaseProvider({ DATABASE_URL: "file:./dev.db", DATABASE_PROVIDER: "postgresql" })).toBe("postgresql")
    expect(resolveDatabaseProvider({ DATABASE_URL: "postgres://localhost/folio", DATABASE_PROVIDER: "sqlite" })).toBe(
      "sqlite",
    )
    expect(resolveDatabaseProvider({ DATABASE_PROVIDER: "Postgres" })).toBe("postgresql")
  })

  it("rejects an unknown provider", () => {
    expect(() => resolveDatabaseProvider({ DATABASE_PROVIDER: "mysql" })).toThrow("未知的数据库：mysql")
  })
})

describe("env file", () => {
  it("reads the example file as sqlite and ignores comments", () => {
    const parsed = parseDotEnv(fs.readFileSync(".env.example", "utf8"))
    expect(parsed.DATABASE_URL).toBe("file:./dev.db")
    expect(parsed.AUTH_SECRET).toBe("folio-dev-secret-change-me-32chars")
    expect(parsed.IMAGE_STORAGE).toBe("local")
    expect(resolveDatabaseProvider(parsed)).toBe("sqlite")
    expect(Object.keys(parsed).some((key) => key.startsWith("#"))).toBe(false)
  })

  it("parses quotes, export, and inline comments", () => {
    const parsed = parseDotEnv(`
# comment
DATABASE_URL="file:./dev.db"
export DIRECT_URL='postgresql://user:pass@localhost:5432/folio'
PLAIN=hello # note
`)
    expect(parsed.DATABASE_URL).toBe("file:./dev.db")
    expect(parsed.DIRECT_URL).toBe("postgresql://user:pass@localhost:5432/folio")
    expect(parsed.PLAIN).toBe("hello")
  })

  it("does not let a file override variables already set in the environment", () => {
    expect(
      mergeEnv({ DATABASE_URL: "postgresql://keep/folio" }, { DATABASE_URL: "file:./dev.db", AUTH_SECRET: "from-file" }),
    ).toEqual({
      DATABASE_URL: "postgresql://keep/folio",
      AUTH_SECRET: "from-file",
    })
  })
})

describe("schema and seed sql", () => {
  it("leaves the sqlite schema untouched", () => {
    expect(renderPrismaSchema(schema, "sqlite")).toBe(schema)
  })

  it("rewrites only the datasource for postgresql and can add a direct url", () => {
    const rendered = renderPrismaSchema(schema, "postgresql")
    expect(rendered).toContain('provider  = "postgresql"')
    expect(rendered).not.toContain('provider = "sqlite"')
    expect(rendered).not.toContain("directUrl")
    expect(rendered).toContain("model Block")
    expect(rendered).toContain("parentId")
    expect(rendered).toContain("model UserPreference")
    expect(renderPrismaSchema(schema, "postgresql", { directUrl: true })).toContain('directUrl = env("DIRECT_URL")')
  })

  it("refuses to guess when the sqlite datasource block changed", () => {
    expect(() => renderPrismaSchema('datasource db {\n  provider = "postgresql"\n}\n', "postgresql")).toThrow(
      "不是预期的 sqlite 块",
    )
  })

  it("keeps the sqlite reset statements and uses deletes for postgresql", () => {
    const sqlite = resetStatements("sqlite")
    expect(
      sqlite.filter((statement) => statement !== 'DELETE FROM "PageSnapshot"' && statement !== 'DELETE FROM "PagePresence"' && statement !== 'DELETE FROM "UserPreference"'),
    ).toEqual([
      "PRAGMA foreign_keys = OFF",
      'DELETE FROM "Favorite"',
      'DELETE FROM "Block"',
      'DELETE FROM "Page"',
      'DELETE FROM "WorkspaceMember"',
      'DELETE FROM "Workspace"',
      'DELETE FROM "User"',
      "PRAGMA foreign_keys = ON",
    ])
    expect(sqlite.indexOf('DELETE FROM "PageSnapshot"')).toBeGreaterThan(sqlite.indexOf('DELETE FROM "Block"'))
    expect(sqlite.indexOf('DELETE FROM "PageSnapshot"')).toBeLessThan(sqlite.indexOf('DELETE FROM "Page"'))
    expect(sqlite.indexOf('DELETE FROM "PageSnapshot"')).toBeLessThan(sqlite.indexOf('DELETE FROM "User"'))
    expect(sqlite.indexOf('DELETE FROM "PagePresence"')).toBeGreaterThan(sqlite.indexOf('DELETE FROM "Block"'))
    expect(sqlite.indexOf('DELETE FROM "PagePresence"')).toBeLessThan(sqlite.indexOf('DELETE FROM "Page"'))
    expect(sqlite.indexOf('DELETE FROM "PagePresence"')).toBeLessThan(sqlite.indexOf('DELETE FROM "User"'))
    expect(sqlite.indexOf('DELETE FROM "UserPreference"')).toBeGreaterThan(sqlite.indexOf('DELETE FROM "Page"'))
    expect(sqlite.indexOf('DELETE FROM "UserPreference"')).toBeLessThan(sqlite.indexOf('DELETE FROM "User"'))
    const postgres = resetStatements("postgresql")
    expect(postgres.some((statement) => statement.includes("PRAGMA"))).toBe(false)
    expect(postgres.indexOf('DELETE FROM "Favorite"')).toBeLessThan(postgres.indexOf('DELETE FROM "Page"'))
    expect(postgres.indexOf('DELETE FROM "UserPreference"')).toBeLessThan(postgres.indexOf('DELETE FROM "User"'))
    expect(postgres.indexOf('DELETE FROM "WorkspaceMember"')).toBeLessThan(postgres.indexOf('DELETE FROM "Workspace"'))
    expect(postgres.indexOf('DELETE FROM "PageSnapshot"')).toBeLessThan(postgres.indexOf('DELETE FROM "Page"'))
    expect(postgres.indexOf('DELETE FROM "PageSnapshot"')).toBeLessThan(postgres.indexOf('DELETE FROM "User"'))
    expect(postgres.indexOf('DELETE FROM "PagePresence"')).toBeLessThan(postgres.indexOf('DELETE FROM "Page"'))
    expect(postgres.indexOf('DELETE FROM "PagePresence"')).toBeLessThan(postgres.indexOf('DELETE FROM "User"'))
  })

  it("creates the page history table for both sqlite and postgresql", () => {
    const sqlite = pageHistoryStatements("sqlite")
    const postgres = pageHistoryStatements("postgresql")
    const migration = fs.readFileSync("prisma/migrations/20261127120000_page_snapshots/migration.sql", "utf8")
    expect(sqlite[0]).toContain("DATETIME")
    expect(sqlite[0]).not.toContain("TIMESTAMP")
    expect(postgres[0]).toContain("TIMESTAMP(3)")
    expect(postgres[0]).not.toContain("DATETIME")
    for (const statement of sqlite) {
      expect(migration).toContain(statement)
      expect(statement).toContain("PageSnapshot")
    }
    expect(migration).not.toContain("TIMESTAMP")
    expect(sqlite.join("\n")).toContain("ON DELETE CASCADE")
    expect(postgres.join("\n")).not.toContain("PRAGMA")
    expect(postgres.join("\n")).toContain('REFERENCES "Page" ("id") ON DELETE CASCADE')
    expect(postgres.join("\n")).toContain('REFERENCES "User" ("id") ON DELETE CASCADE')
  })

  it("creates the presence table for both sqlite and postgresql", () => {
    const sqlite = presenceStatements("sqlite")
    const postgres = presenceStatements("postgresql")
    const migration = fs.readFileSync("prisma/migrations/20261127140000_page_presence/migration.sql", "utf8")
    expect(sqlite[0]).toContain("DATETIME")
    expect(sqlite[0]).not.toContain("TIMESTAMP")
    expect(postgres[0]).toContain("TIMESTAMP(3)")
    expect(postgres[0]).not.toContain("DATETIME")
    for (const statement of sqlite) {
      expect(migration).toContain(statement)
      expect(statement).toContain("PagePresence")
    }
    expect(migration).not.toContain("TIMESTAMP")
    expect(sqlite.join("\n")).toContain("ON DELETE CASCADE")
    expect(postgres.join("\n")).not.toContain("PRAGMA")
    expect(postgres.join("\n")).toContain('REFERENCES "Page" ("id") ON DELETE CASCADE')
    expect(postgres.join("\n")).toContain('REFERENCES "User" ("id") ON DELETE CASCADE')
    expect(sqlite[1]).toContain('("pageId", "userId")')
  })
})
