import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { openStore } from '@datalom/shared/storage/runtime';
const store = await openStore();
try {
  const id = process.argv[2];
  const row = (await store.diagnostics.find(row => row.kind === 'evidence' && row.evidenceKind === 'script-analysis' && (!id || row.id === id), 1, true))[0];
  if (!row) throw new Error('先运行 inspect-scripts 采集脚本证据');
  const item = (await store.diagnostics.rawEvent(row.id) as any).payload;
  const ast = parse(item.source, { sourceType: 'unambiguous' }),
    paths = new Set<string>();
  let functions = 0;
  traverse(ast, {
    StringLiteral(path) {
      if (path.node.value.startsWith('/api/')) paths.add(path.node.value);
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
  await store.evidence(
    row.accountId,
    'ast-analysis',
    `AST 分析 · ${functions} 个函数 · ${paths.size} 个 API 路径`,
    result,
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await store.close();
}
