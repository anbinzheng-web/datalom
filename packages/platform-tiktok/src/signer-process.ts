import { sourceMode, nodeLoaderArgs } from "@datalom/runtime-node/paths";
import { fork } from "node:child_process";
import { DatalomError } from "@datalom/runtime-node/contracts";
import type { SignInput } from "./signer.ts";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
export function signInProcess(
  input: SignInput,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DatalomError("CANCELLED", "签名已取消"));
      return;
    }
    const child = fork(
      new URL(
        sourceMode ? "./signer-entry.ts" : "./signer-entry.js",
        import.meta.url,
      ),
      [],
      {
        execArgv: nodeLoaderArgs(),
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        env: { PATH: process.env.PATH },
      },
    );
    let settled = false;
    let stderr = "",
      stderrBytes = 0;
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      stderr = (stderr + chunk.toString("utf8")).slice(-65536);
    });
    const done = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      child.kill();
      if (error)
        reject(
          new DatalomError(
            error instanceof DatalomError ? error.code : "RESEARCH_REQUIRED",
            error.message,
            {
              cause: {
                error: errorRecord(error),
                stderr,
                stderrBytes,
                truncated: stderrBytes > 65536,
              },
            },
          ),
        );
      else resolve(value!);
    };
    const abort = () => done(new DatalomError("CANCELLED", "签名已取消"));
    const timer = setTimeout(
      () => done(new DatalomError("RESEARCH_REQUIRED", "独立签名进程超时")),
      5000,
    );
    signal.addEventListener("abort", abort, { once: true });
    child.on("error", (error) =>
      done(
        new DatalomError("RESEARCH_REQUIRED", "独立签名进程启动失败", {
          cause: error,
        }),
      ),
    );
    child.on("exit", (code, signal) => {
      if (!settled)
        done(
          new DatalomError("RESEARCH_REQUIRED", "独立签名进程意外退出", {
            cause: new Error(`exit code=${code} signal=${signal}`),
          }),
        );
    });
    child.on("message", (message: any) =>
      message.error
        ? done(
            new DatalomError("RESEARCH_REQUIRED", message.error, {
              cause: message.detail,
            }),
          )
        : done(undefined, message.url),
    );
    child.send(input);
  });
}
