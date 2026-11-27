const fs = require("fs")

if (!process.env.VERCEL && !fs.existsSync(".env")) {
  fs.copyFileSync(".env.example", ".env")
  console.log("Created .env from .env.example")
}
