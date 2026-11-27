import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { mergeEnv, parseDotEnv, renderPrismaSchema, resolveDatabaseProvider } from "../src/lib/database-provider"

function loadProjectEnv() {
  const file = path.join(process.cwd(), ".env")
  if (!fs.existsSync(file)) return
  const merged = mergeEnv(process.env, parseDotEnv(fs.readFileSync(file, "utf8")))
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && process.env[key] === undefined) process.env[key] = value
  }
}

function modeFromArgs(argv: string[]) {
  const flags = ["--generate-only", "--push-only", "--reset"].filter((flag) => argv.includes(flag))
  if (flags.length > 1) {
    console.error("db-prepare 一次只能选一种：--generate-only、--push-only 或 --reset")
    process.exit(1)
  }
  if (flags[0] === "--generate-only") return "generate"
  if (flags[0] === "--push-only") return "push"
  if (flags[0] === "--reset") return "reset"
  return "all"
}

function runPrisma(args: string[]) {
  const entry = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js")
  if (!fs.existsSync(entry)) {
    console.error("找不到 Prisma。请先在项目目录运行 npm install。")
    process.exit(1)
  }
  const result = spawnSync(process.execPath, [entry, ...args], { stdio: "inherit", env: process.env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

loadProjectEnv()
const provider = resolveDatabaseProvider(process.env)
const mode = modeFromArgs(process.argv.slice(2))
const postgresSchema = path.join(process.cwd(), "prisma", "schema.postgres.prisma")

if (provider === "sqlite") {
  fs.rmSync(postgresSchema, { force: true })
  console.log(`数据库：sqlite（${mode}）`)
  if (mode === "generate" || mode === "all") runPrisma(["generate"])
  if (mode === "reset") {
    fs.rmSync(path.join("prisma", "dev.db"), { force: true })
    fs.rmSync(path.join("prisma", "dev.db-journal"), { force: true })
    runPrisma(["db", "push"])
  } else if (mode === "push" || mode === "all") {
    runPrisma(["db", "push"])
  }
} else {
  const rendered = renderPrismaSchema(fs.readFileSync(path.join("prisma", "schema.prisma"), "utf8"), "postgresql", {
    directUrl: Boolean(process.env.DIRECT_URL?.trim()),
  })
  fs.writeFileSync(postgresSchema, `// 由 scripts/db-prepare.ts 生成，不要手改。\n${rendered}`)
  const schemaArgs = ["--schema", postgresSchema]
  console.log(`数据库：postgresql（${mode}）`)
  if (mode === "generate" || mode === "all" || mode === "push" || mode === "reset") {
    runPrisma(["generate", ...schemaArgs])
  }
  if (mode === "reset") {
    runPrisma(["db", "push", ...schemaArgs, "--force-reset", "--accept-data-loss", "--skip-generate"])
  } else if (mode === "push" || mode === "all") {
    runPrisma(["db", "push", ...schemaArgs, "--skip-generate"])
  }
}
