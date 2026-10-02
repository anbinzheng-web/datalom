import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { openStore } from "@datalom/shared/storage/runtime";
const store = openStore();
try {
  const id = process.argv[2];
  const row = store.sql
    .prepare(
      "SELECT id,accountId,payload FROM evidence WHERE kind='script-analysis' AND (? IS NULL OR id=?) ORDER BY createdAt DESC LIMIT 1",
    )
    .get(id ?? null, id ?? null) as any;
  if (!row) throw new Error("先运行 inspect-scripts 采集脚本证据");
  const item = store.vault.open<any>(row.payload, `evidence:${row.id}`);
  const ast = parse(item.source, { sourceType: "unambiguous" }),
    paths = new Set<string>();
  let functions = 0;
  traverse(ast, {
    StringLiteral(path) {
      if (path.node.value.startsWith("/api/")) paths.add(path.node.value);
    },
    Function() {
      functions++;
    },
  });
  const result = {
    sourceDigest: item.digest,
    functions,
    apiPaths: [...paths].sort(),
  };
  store.evidence(
    row.accountId,
    "ast-analysis",
    `AST 分析 · ${functions} 个函数 · ${paths.size} 个 API 路径`,
    result,
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.close();
}
