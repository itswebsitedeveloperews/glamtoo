import { defineConfig } from "@playwright/test";
import storefront from "./playwright.config";

// Reuse the existing isolated Vite harness: no preview/API/database required.
const port = Number(process.env.PRODUCT_LAYOUT_PORT || 18784);
export default defineConfig({
  ...storefront,
  testMatch: "product-layout.spec.ts",
  outputDir: "../../generated-artifacts/product-layout-tests",
  use: {
    ...storefront.use,
    baseURL: `http://127.0.0.1:${port}`,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node test/ssr-server.mjs development",
    env: { SSR_BROWSER_PORT: String(port) },
    url: `http://127.0.0.1:${port}/__health`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
