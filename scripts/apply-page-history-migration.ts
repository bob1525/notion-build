import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import { mergeEnv, pageHistoryStatements, parseDotEnv, resolveDatabaseProvider } from "../src/lib/database-provider"

function loadProjectEnv() {
  const file = path.join(process.cwd(), ".env")
  if (!fs.existsSync(file)) return
  const merged = mergeEnv(process.env, parseDotEnv(fs.readFileSync(file, "utf8")))
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && process.env[key] === undefined) process.env[key] = value
  }
}

loadProjectEnv()
const provider = resolveDatabaseProvider(process.env)
const prisma = new PrismaClient()

async function main() {
  for (const statement of pageHistoryStatements(provider)) {
    await prisma.$executeRawUnsafe(statement)
  }
  console.log(`页面历史表：${provider}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
