import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// src/ and dist/ have the same depth. Package commands must use the same vault as root commands.
export const repositoryRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);
export const dataDirectory = () =>
  resolve(repositoryRoot, process.env.DATALOM_DATA_DIR ?? process.env.SPIDER_DATA_DIR ?? (existsSync(resolve(repositoryRoot, ".spider")) ? ".spider" : ".datalom"));
export const sourceMode = import.meta.url.endsWith(".ts");
export const nodeLoaderArgs = () =>
  sourceMode ? ["--import", "tsx", "--conditions=datalom-source"] : [];
