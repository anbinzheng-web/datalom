import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { Entry } from "@napi-rs/keyring";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export function loadMasterKey(dataDir: string): Buffer {
  const entry = new Entry(
    "spider",
    `master-${createHash("sha256").update(resolve(dataDir)).digest("hex").slice(0, 24)}`,
  );
  const existing = entry.getPassword();
  if (existing) {
    const key = Buffer.from(existing, "base64");
    if (key.length !== 32) throw new Error("Invalid system keyring key");
    return key;
  }
  if (existsSync(resolve(dataDir, "spider.sqlite")))
    throw new Error(
      "Spider 数据库已存在，但系统凭据库中缺少主密钥。请恢复原密钥，不要覆盖现有数据。",
    );
  const key = randomBytes(32);
  entry.setPassword(key.toString("base64"));
  return key;
}
export class Vault {
  constructor(private key: Buffer) {
    if (key.length !== 32) throw new Error("AES-256 requires 32 bytes");
  }
  seal(value: unknown, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      data.toString("base64"),
    ].join(".");
  }
  open<T>(value: string, context: string): T {
    const [version, iv, tag, data] = value.split(".");
    if (version !== "v1") throw new Error("Unknown encryption version");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data, "base64")),
        decipher.final(),
      ]).toString(),
    );
  }
}
