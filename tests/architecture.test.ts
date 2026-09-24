import { it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
it("production worker dependency graph has no browser connector or Playwright", () => {
  const seen = new Set<string>();
  const visit = (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    expect(
      path,
      "production must not import platform research tools",
    ).not.toMatch(/\/platforms\/[^/]+\/research\//);
    const source = readFileSync(path, "utf8");
    expect(source, `${path} must not depend on browser execution`).not.toMatch(
      /from\s+["'](?:playwright|@roxybrowser)|connectOverCDP|\.\.\/.*connector/,
    );
    for (const match of source.matchAll(
      /(?:from\s*|import\s*\()["'](\.[^"']+)["']/g,
    )) {
      const next = resolve(dirname(path), match[1]);
      if (existsSync(next) && next.endsWith(".ts")) visit(next);
    }
  };
  visit(resolve("apps/worker/src/main.ts"));
  visit(resolve("src/platforms/tiktok/tools/native-run.ts"));
  visit(resolve("src/platforms/tiktok/signer-entry.ts"));
  visit(resolve("src/platforms/facebook/tools/native-run.ts"));
  visit(resolve("src/platforms/instagram/tools/native-run.ts"));
  visit(resolve("src/platforms/x/tools/native-run.ts"));
  visit(resolve("src/platforms/doubao/tools/native-run.ts"));
  expect(seen.size).toBeGreaterThan(8);
});
