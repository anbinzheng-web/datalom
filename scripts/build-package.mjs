import ts from 'typescript';
import { readdir, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

// Preserve module boundaries and every subprocess entrypoint; do not bundle native addons.
const root = process.cwd();
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const research = manifest.name.startsWith('@datalom/research-');
await rm(join(root, 'dist'), { recursive: true, force: true });
async function emit(dir, base, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'tests' || entry.name.endsWith('.test.ts')) continue;
    const input = join(dir, entry.name);
    if (entry.isDirectory()) {
      await emit(input, base, prefix);
      continue;
    }
    const output = join(root, 'dist', prefix, relative(base, input).replace(/\.tsx?$/, '.js'));
    await mkdir(join(output, '..'), { recursive: true });
    if (['.ts', '.tsx'].includes(extname(input))) {
      const result = ts.transpileModule(await readFile(input, 'utf8'), {
        fileName: input,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          rewriteRelativeImportExtensions: true,
          sourceMap: true,
        },
      });
      await writeFile(output, result.outputText);
      if (result.sourceMapText) await writeFile(output + '.map', result.sourceMapText);
    } else await copyFile(input, output);
  }
}
for (const name of ['src', ...(research ? ['tools'] : [])]) {
  try {
    await readdir(join(root, name));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  await emit(join(root, name), join(root, name), research ? name : '');
}
