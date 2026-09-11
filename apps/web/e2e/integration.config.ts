import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)), 'server-only': fileURLToPath(new URL('../src/test/server-only.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['e2e/qonto.integration.ts', 'e2e/recurring-detection.integration.ts'], testTimeout: 30000, fileParallelism: false },
});
