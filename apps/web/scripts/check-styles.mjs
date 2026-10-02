import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowedCss = new Set(['app/globals.css', 'app/reset.css', 'app/tokens.css']);
const failures = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(absolute);
      continue;
    }
    if (!entry.name.endsWith('.css')) continue;
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const source = (await readFile(absolute, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    if (!allowedCss.has(relative))
      failures.push(`${relative}: component styles belong in JSX Tailwind utilities.`);
    if (/@apply\b/.test(source))
      failures.push(`${relative}: @apply component recipes are not allowed.`);
    if (/\.[a-zA-Z][\w-]*[^{}]*\{/.test(source))
      failures.push(`${relative}: global class selectors are not allowed.`);
  }
}
await inspect(path.join(root, 'app'));
await inspect(path.join(root, 'components'));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Style boundaries passed: Tailwind utilities + base tokens/reset + namespaced keyframes.',
  );
