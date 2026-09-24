import { spawn } from "node:child_process";
import { unlinkSync } from "node:fs";
const [binary, config] = process.argv.slice(2);
if (!binary || !config) process.exit(1);
const child = spawn(binary, ["-C", config], {
  stdio: ["ignore", "ignore", "pipe"],
});
child.stderr?.pipe(process.stderr);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  try {
    unlinkSync(config);
  } catch {}
  setTimeout(() => {
    child.kill("SIGKILL");
    process.exit(0);
  }, 1500).unref();
}
// The parent owns stdin. Even SIGKILL closes the pipe, so the tunnel cannot
// survive an orphaned Worker and retain its proxy credentials indefinitely.
process.stdin.resume();
process.stdin.on("end", stop);
process.stdin.on("close", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("error", (error) => {
  process.stderr.write(
    JSON.stringify({
      name: error.name,
      message: error.message,
      code: (error as NodeJS.ErrnoException).code,
    }) + "\n",
  );
  stop();
  process.exitCode = 1;
});
child.on("exit", (code) => {
  try {
    unlinkSync(config);
  } catch {}
  process.exit(stopping ? 0 : (code ?? 1));
});
