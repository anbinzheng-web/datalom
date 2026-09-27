import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const path = process.argv[2] ?? "config/roxy.json";
const value = JSON.parse(await readFile(resolve(path), "utf8"));
if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Roxy config must be an object");
try {
  const host = new URL(value.host);
  if (!['http:', 'https:'].includes(host.protocol)) throw new Error();
} catch {
  throw new Error("host must be an http(s) URL");
}
for (const field of ["apikey", "workspaceId"]) {
  if (typeof value[field] !== "string" || !value[field].trim()) throw new Error(`${field} is required`);
}
if (!Number.isInteger(value.maxConcurrent) || value.maxConcurrent < 1) {
  throw new Error("maxConcurrent must be a positive integer");
}
if (!Array.isArray(value.profiles) || value.profiles.length === 0) {
  throw new Error("profiles must be a non-empty array");
}
const dirIds = new Set();
for (const [index, profile] of value.profiles.entries()) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error(`profiles[${index}] must be an object`);
  }
  if (typeof profile.dirId !== "string" || !profile.dirId.trim()) {
    throw new Error(`profiles[${index}].dirId is required`);
  }
  if (dirIds.has(profile.dirId)) throw new Error(`duplicate dirId in profiles[${index}]`);
  dirIds.add(profile.dirId);
  if (!Array.isArray(profile.platforms) || profile.platforms.length === 0 ||
      profile.platforms.some((platform) => typeof platform !== "string" || !platform.trim()) ||
      new Set(profile.platforms).size !== profile.platforms.length) {
    throw new Error(`profiles[${index}].platforms must be a non-empty array of unique names`);
  }
}
console.log(`Roxy config OK: ${value.profiles.length} profiles`);
