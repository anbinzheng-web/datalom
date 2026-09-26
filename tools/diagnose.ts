import { openStore } from "@datalom/storage-node/runtime";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
const store = openStore();
const [command, id] = process.argv.slice(2);
const folder = join(store.dir, "diagnostics", "exports");
function save(name: string, data: unknown) {
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const path = join(folder, name);
  writeFileSync(path, JSON.stringify(data, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(path);
}
try {
  if (command === "inspect" && id) {
    console.log(
      JSON.stringify(store.diagnostics.bundle(store.task(id)), null, 2),
    );
  } else if (command === "raw" && id) {
    // Deliberate local-only export; never send raw secrets through a web API or stdout.
    save(`sensitive-event-${Date.now()}.json`, store.diagnostics.rawEvent(id));
  } else if (command === "emergency") {
    const rows = readFileSync(
      join(store.dir, "diagnostics", "emergency.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => {
        const r = JSON.parse(line);
        return {
          id: r.id,
          createdAt: r.createdAt,
          data: store.vault.open(r.payload, `emergency:${r.id}`),
        };
      });
    save(`sensitive-emergency-${Date.now()}.json`, rows);
  } else if (command === "replay" && id) {
    const original = store.task(id);
    const task = store.enqueue(original.input);
    store.diagnostics.event(
      { taskId: task.id, requestId: task.requestId, accountId: task.accountId },
      "replay",
      "submitted",
      { sourceTaskId: id, semantics: "current-session-fresh-signatures" },
    );
    console.log(
      JSON.stringify({
        taskId: task.id,
        sourceTaskId: id,
        note: "已提交一次新任务，使用当前会话和新签名；仍遵守账号状态、代理和频率限制",
      }),
    );
  } else if (command === "events") {
    console.log(JSON.stringify(store.diagnostics.events(), null, 2));
  } else {
    console.log(
      "Usage: pnpm diagnose inspect <taskId> | events | raw <eventId> | emergency | replay <taskId>\nraw/emergency 会将含敏感信息的证据解密到本机 .datalom/diagnostics/exports，仅在本机排查，不要上传共享。",
    );
    process.exitCode = 1;
  }
} finally {
  store.close();
}
