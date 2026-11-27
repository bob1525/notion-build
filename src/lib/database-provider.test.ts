import fs from "node:fs"
import { describe, expect, it } from "vitest"
import {
  mergeEnv,
  parseDotEnv,
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
    expect(resetStatements("sqlite")).toEqual([
      "PRAGMA foreign_keys = OFF",
      'DELETE FROM "Favorite"',
      'DELETE FROM "Block"',
      'DELETE FROM "Page"',
      'DELETE FROM "WorkspaceMember"',
      'DELETE FROM "Workspace"',
      'DELETE FROM "User"',
      "PRAGMA foreign_keys = ON",
    ])
    const postgres = resetStatements("postgresql")
    expect(postgres.some((statement) => statement.includes("PRAGMA"))).toBe(false)
    expect(postgres.indexOf('DELETE FROM "Favorite"')).toBeLessThan(postgres.indexOf('DELETE FROM "Page"'))
    expect(postgres.indexOf('DELETE FROM "UserPreference"')).toBeLessThan(postgres.indexOf('DELETE FROM "User"'))
    expect(postgres.indexOf('DELETE FROM "WorkspaceMember"')).toBeLessThan(postgres.indexOf('DELETE FROM "Workspace"'))
  })
})
