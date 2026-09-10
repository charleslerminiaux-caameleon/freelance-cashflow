import { defineConfig, devices } from "@playwright/test";

const port = 3_200;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "line",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "./test-results",
  use: {
    baseURL,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node e2e/start-server.cjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
