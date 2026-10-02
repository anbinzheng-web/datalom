import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { conditions: ["datalom-source"] },
  ssr: { resolve: { conditions: ["datalom-source"] } },
  test: {
    server: { deps: { inline: [/^@datalom\//] } },
    include: ["scripts/checks/**/*.test.ts", "packages/*/src/tests/**/*.test.ts"],
    testTimeout: 15000,
  },
});
