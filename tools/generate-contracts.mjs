import { readFile, writeFile } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";
const url = new URL("../contracts/openapi/datalom.json", import.meta.url);
const spec = JSON.parse(await readFile(url, "utf8"));
const generated = astToString(await openapiTS(spec));
const outputs = new Map([
  ["../packages/contracts-ts/src/generated.ts", generated],
  [
    "../packages/contracts-ts/src/schema.ts",
    "// Generated from contracts/openapi/datalom.json; do not edit.\nexport const apiContract = " +
      JSON.stringify(spec, null, 2) +
      " as const;\n",
  ],
]);
for (const [path, content] of outputs) {
  const target = new URL(path, import.meta.url);
  if (process.argv.includes("--check")) {
    if ((await readFile(target, "utf8").catch(() => "")) !== content)
      throw new Error("Stale generated contract: " + path);
  } else await writeFile(target, content);
}
