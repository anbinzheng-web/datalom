import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Store } from "@datalom/shared/storage/store";
import { Vault } from "@datalom/shared/storage/crypto";
import { buildApp } from "@datalom/server/app";
import { runIdle } from "@datalom/worker/idle";
import { signInProcess } from "@datalom/platform-tiktok/signer-process";
import {
  repositoryRoot,
  dataDirectory,
  sourceMode,
} from "@datalom/shared/runtime/paths";

assert.equal(sourceMode, false);
for (const name of [
  "@datalom/worker/main",
  "@datalom/platform-tiktok/signer-entry",
  "@datalom/network-node/route-guardian",
]) {
  const entry = import.meta.resolve(name);
  assert.match(entry, /\/dist\/.*\.js$/);
  assert.ok(existsSync(new URL(entry)));
}
const cwd = process.cwd();
const before = dataDirectory();
process.chdir(join(repositoryRoot, "apps/server"));
assert.equal(dataDirectory(), before);
process.chdir(cwd);
const dir = mkdtempSync(join(tmpdir(), "datalom-built-"));
const store = new Store(dir, new Vault(randomBytes(32)));
const app = await buildApp(store);
const worker = runIdle(store);
try {
  assert.equal(worker.healthy, true);
  assert.equal((await app.inject("/api/health")).statusCode, 200);
  assert.match((await app.inject("/")).body, /<html/);
  // A protocol error proves the compiled signer child executed and replied over IPC.
  await assert.rejects(
    signInProcess(
      { templateUrl: "https://www.tiktok.com/api/comment/list/" },
      AbortSignal.timeout(5000),
    ),
    (error) =>
      error.code === "RESEARCH_REQUIRED" &&
      error.message === "此接口签名组合尚未实现，已保留请求样本",
  );
  const config = join(dir, "guardian-fixture.json");
  const binary = join(dir, "fake-gost");
  writeFileSync(config, "{}");
  writeFileSync(
    binary,
    `#!${process.execPath}
process.stderr.write('fixture-ready\\n');
setInterval(() => {}, 1000);
`,
    { mode: 0o700 },
  );
  const guardian = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.resolve("@datalom/network-node/route-guardian")),
      binary,
      config,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  const exited = once(guardian, "exit");
  const timeout = setTimeout(() => guardian.kill("SIGKILL"), 5000);
  try {
    const [output] = await once(guardian.stderr, "data");
    assert.match(output.toString(), /fixture-ready/);
    guardian.stdin.end();
    const [code] = await exited;
    assert.equal(code, 0);
    assert.equal(existsSync(config), false);
  } finally {
    clearTimeout(timeout);
    guardian.kill();
  }
  console.log(
    "Built API, web, Worker, signer IPC, entrypoints and package data paths verified.",
  );
} finally {
  await worker.stop();
  await app.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
