import { copyFile, mkdir } from 'node:fs/promises';
const source = new URL('../packages/shared/brand/', import.meta.url);
for (const app of ['web', 'admin-web']) {
  const target = new URL(`../apps/${app}/public/`, import.meta.url);
  await mkdir(target, { recursive: true });
  for (const name of [
    'datalom-logo.svg',
    'datalom-logo-light.svg',
    'datalom-symbol.svg',
    'favicon.svg',
    'favicon.ico',
    'apple-touch-icon.png',
  ]) {
    await copyFile(new URL(name, source), new URL(name, target));
  }
}
