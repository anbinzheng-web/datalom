import { dataDirectory } from "@datalom/shared/runtime/paths";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, chmodSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
const version = "3.3.0";
const arch =
  process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "amd64" : null;
if (!arch || !["darwin", "linux"].includes(process.platform))
  throw new Error("请安装 GOST v3 并通过 DATALOM_GOST_BIN 指定路径");
const dir = resolve(dataDirectory(), "bin");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const name = `gost_${version}_${process.platform}_${arch}.tar.gz`,
  base = `https://github.com/go-gost/gost/releases/download/v${version}/`;
const read = async (url: string) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};
const sums = (await read(base + "checksums.txt")).toString();
const expected = sums
  .split("\n")
  .find((l) => l.trim().endsWith(name))
  ?.split(/\s+/)[0];
if (!expected) throw new Error("Missing release checksum");
const data = await read(base + name);
if (createHash("sha256").update(data).digest("hex") !== expected)
  throw new Error("Checksum mismatch");
const archive = join(dir, name);
writeFileSync(archive, data, { mode: 0o600 });
execFileSync("tar", ["-xzf", archive, "-C", dir, "gost"]);
chmodSync(join(dir, "gost"), 0o700);
unlinkSync(archive);
console.log(
  execFileSync(join(dir, "gost"), ["-V"], { encoding: "utf8" }).trim(),
);
