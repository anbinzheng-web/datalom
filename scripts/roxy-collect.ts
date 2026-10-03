import { resolve } from 'node:path';
import { repositoryRoot } from '@datalom/shared/runtime/paths';
import { openStore } from '@datalom/shared/storage/runtime';
import {
  readCollectorConfig,
  collectProfiles,
} from '../packages/platform-tiktok/research/src/collector.ts';

try {
  const config = await readCollectorConfig(
    resolve(
      repositoryRoot,
      process.argv.slice(2).find((arg) => arg !== '--check') ?? 'scripts/config/roxy.json',
    ),
  );
  if (process.argv.includes('--check')) {
    console.log(`Roxy config OK: ${config.profiles.length} profiles`);
  } else {
    const store = await openStore();
    try {
      const result = await collectProfiles(config, store, (result) => {
        console.log(JSON.stringify(result));
      });
      if (result.failed) {
        console.error(
          `${result.failed} 项提取失败。请检查 Roxy 连接、Profile 占用、平台登录状态及账号任务占用后重试。`,
        );
        process.exitCode = 1;
      }
    } finally {
      await store.close();
    }
  }
} catch {
  console.error('提取未启动：请检查配置文件、本机 Roxy API 和系统凭据库。未输出连接凭据。');
  process.exitCode = 1;
}
