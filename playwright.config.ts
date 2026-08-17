import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3210);

export default defineConfig({
  testDir: "./e2e",
  // Four browser contexts sharing one tournament is inherently sequential, and the
  // specs write to a real Neon branch, so they must not race each other.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `./node_modules/.bin/next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
