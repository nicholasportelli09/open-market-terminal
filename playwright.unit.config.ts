import { defineConfig } from "@playwright/test";

/** Unit tests for pure calculation modules (no browser, no server). Run: npm run test:unit */
export default defineConfig({
  testDir: "tests/unit",
  timeout: 30_000,
  workers: 3, // measured 2026-11-24: 3 is fastest (2.05 s vs 2.3 s at 2, 2.0-2.2 s at 4-6) with ~200 MB less than 4+
});
