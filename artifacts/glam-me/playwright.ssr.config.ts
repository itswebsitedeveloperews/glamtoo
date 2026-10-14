import { defineConfig } from "@playwright/test";
import storefront from "./playwright.config";

const developmentPort = Number(process.env.SSR_DEV_PORT || 18782);
const productionPort = Number(process.env.SSR_PROD_PORT || 18783);

export default defineConfig({
  testDir: "./test",
  testMatch: "public-ssr.spec.ts",
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  reporter: "list",
  outputDir: "../../generated-artifacts/ssr-browser-tests",
  use: {
    ...storefront.use,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "ssr-development", use: { baseURL: `http://127.0.0.1:${developmentPort}` } },
    { name: "ssr-production", use: { baseURL: `http://127.0.0.1:${productionPort}` } },
  ],
  webServer: [
    {
      command: "node test/ssr-server.mjs development",
      env: { SSR_BROWSER_PORT: String(developmentPort) },
      url: `http://127.0.0.1:${developmentPort}/__health`,
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "node test/ssr-server.mjs production",
      env: { SSR_BROWSER_PORT: String(productionPort) },
      url: `http://127.0.0.1:${productionPort}/__health`,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
