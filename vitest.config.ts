import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/platforms/*/tests/**/*.test.ts"],
    testTimeout: 15000,
  },
});
