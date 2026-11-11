import { defineConfig } from "vitest/config";
import path from "node:path";

// Live smoke tests: they sign in to staging as the suite demo accounts and use the real API.
// Kept out of `bun run test` because they need network access and a seeded staging database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["smoke/**/*.smoke.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
