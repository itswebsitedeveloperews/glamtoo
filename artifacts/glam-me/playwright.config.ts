import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined);

export default defineConfig({
  testDir: "./test",
  testIgnore: "public-ssr.spec.ts",
  timeout: 45000,
  workers: 1,
  reporter: "list",
  outputDir: "../../generated-artifacts/storefront-tests",
  use: {
    baseURL: process.env.STOREFRONT_BASE_URL || "http://localhost",
    headless: true,
    launchOptions: executablePath
      ? { executablePath }
      : {},
  },
});
