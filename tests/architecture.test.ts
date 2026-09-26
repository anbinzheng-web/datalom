import { it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import ts from "typescript";

const root = resolve(".");
const manifests = new Map<
  string,
  { dir: string; dependencies?: Record<string, string> }
>();
for (const base of ["apps", "packages", "research"]) {
  for (const dir of readdirSync(base)) {
    const file = resolve(base, dir, "package.json");
    if (existsSync(file)) {
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      manifests.set(manifest.name, { ...manifest, dir: dirname(file) });
    }
  }
}
function imports(file: string) {
  const ast = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const result: string[] = [];
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      result.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(ast) === "require") &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      result.push(node.arguments[0].text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      result.push(node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return result;
}
function source(specifier: string, from: string) {
  if (specifier.startsWith(".")) return resolve(dirname(from), specifier);
  const [scope, name, ...tail] = specifier.split("/");
  const manifest = manifests.get(scope + "/" + name);
  if (!manifest) return undefined;
  const subpath = tail.join("/") || "index";
  return resolve(
    manifest.dir,
    subpath.startsWith("tools/") ? subpath + ".ts" : "src/" + subpath + ".ts",
  );
}
it("production source graph cannot reach browser research, including workspace imports", () => {
  const seen = new Set<string>();
  function visit(file: string) {
    if (seen.has(file)) return;
    seen.add(file);
    expect(relative(root, file)).not.toMatch(/^research\//);
    const content = readFileSync(file, "utf8");
    expect(content).not.toMatch(/connectOverCDP/);
    for (const spec of imports(file)) {
      expect(spec).not.toMatch(
        /^(playwright|@roxybrowser\/|@datalom\/research-)/,
      );
      const next = source(spec, file);
      if (next && /\.tsx?$/.test(next)) visit(next);
    }
  }
  visit(resolve("apps/worker/src/main.ts"));
  visit(resolve("packages/platform-tiktok/src/signer-entry.ts"));
  for (const platform of ["tiktok", "facebook", "instagram", "x", "doubao"])
    visit(resolve(`packages/platform-${platform}/src/native.ts`));
  expect(seen.size).toBeGreaterThan(15);
});
it("production package dependencies cannot install browser research transitively", () => {
  const seen = new Set<string>();
  function visit(name: string) {
    if (seen.has(name)) return;
    seen.add(name);
    expect(name).not.toMatch(/^(playwright|@roxybrowser\/|@datalom\/research-)/);
    for (const dependency of Object.keys(
      manifests.get(name)?.dependencies ?? {},
    ))
      visit(dependency);
  }
  visit("@datalom/worker");
  for (const platform of ["tiktok", "facebook", "instagram", "x", "doubao"])
    visit("@datalom/platform-" + platform);
});
