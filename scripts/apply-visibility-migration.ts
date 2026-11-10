import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`UPDATE "Page" SET "visibility" = 'public' WHERE "visibility" IN ('edit', 'editable')`)
  await prisma.$executeRawUnsafe(`UPDATE "Page" SET "visibility" = 'read' WHERE "visibility" IN ('readonly', 'public-read', 'public_read')`)
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
