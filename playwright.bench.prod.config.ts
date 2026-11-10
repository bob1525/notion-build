import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "scripts",
  testMatch: "large-page.bench.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  webServer: {
    command: "npm run start -- --port 3000",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
