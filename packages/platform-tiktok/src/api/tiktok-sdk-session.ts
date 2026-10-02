import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sdkSessionManifest as manifestSchema } from '@datalom/platform-runtime/contracts/sdk-session';
import type { PoolCredential } from '@datalom/platform-runtime/contracts/cookie-pool';
import { LabError, type SdkAuxiliaryRequest } from '@datalom/platform-runtime/reverse-core';

const signatureKeys = ['X-Bogus', 'X-Gnarly', 'X-Dynosaur', '_signature', 'msToken'];
const endpoints = ['/api/comment/list/', '/api/comment/list/reply/', '/api/search/general/full/'];
export function resolveSdkManifest(dataDir: string, configuredPath?: string) {
  if (configuredPath) return resolve(configuredPath);
  const local = resolve(dataDir, 'tiktok-sdk/manifest.json');
  if (existsSync(local)) return local;
  // Bundled servers resolve beside server.cjs; source execution uses versioned assets.
  return typeof __dirname === 'string'
    ? resolve(__dirname, 'tiktok-sdk/manifest.json')
    : fileURLToPath(new URL('../assets/tiktok-sdk/manifest.json', import.meta.url));
}

export function unsignedSdkTarget(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new LabError('INVALID_API_TARGET');
  }
  if (
    url.origin !== 'https://www.tiktok.com' ||
    url.username ||
    url.password ||
    url.hash ||
    !endpoints.includes(url.pathname)
  )
    throw new LabError('INVALID_API_TARGET');
  for (const key of signatureKeys) url.searchParams.delete(key);
  return url.toString();
}
export function validateSignedTarget(unsigned: string, signed: string) {
  // Signer may only add its token/signatures; video, cursor, count, endpoint and every other parameter must survive.
  const expected = unsignedSdkTarget(unsigned),
    actual = unsignedSdkTarget(signed);
  if (actual !== expected) throw new LabError('SDK_TARGET_CHANGED');
  const url = new URL(signed);
  if (!signatureKeys.slice(0, 4).some((k) => url.searchParams.get(k)))
    throw new LabError('SDK_SIGNATURE_MISSING');
  if (signatureKeys.some((k) => url.searchParams.getAll(k).length > 1))
    throw new LabError('SDK_DUPLICATE_SIGNATURE');
  return url.toString();
}
export function loadSdkManifest(path: string) {
  const absolute = resolve(path);
  const raw = readFileSync(absolute);
  if (raw.length > 128 * 1024) throw new LabError('SDK_MANIFEST_TOO_LARGE');
  const parsed = manifestSchema.safeParse(JSON.parse(raw.toString()));
  if (!parsed.success) throw new LabError('INVALID_SDK_MANIFEST');
  let bytes = 0;
  const sources = parsed.data.sources.map((item) => {
    const source = readFileSync(resolve(dirname(absolute), item.path));
    bytes += source.length;
    if (bytes > 4 * 1024 * 1024) throw new LabError('SOURCE_TOO_LARGE');
    if (createHash('sha256').update(source).digest('hex') !== item.sha256)
      throw new LabError('SDK_SOURCE_HASH_MISMATCH');
    return source.toString();
  });
  return {
    sources,
    resourceUrls: parsed.data.sources.map((source) => source.resourceUrl ?? null),
    init: parsed.data.init,
    evidence: {
      sourceHashes: parsed.data.sources.map((s) => s.sha256),
      sourceBytes: bytes,
      redactionMarkers: sources.map((s) => s.split('[REDACTED]').length - 1),
      initProvenance: parsed.data.init.provenance,
    },
  };
}
export type SdkDiagnostics = {
  missing: string[];
  unsupported: string[];
  blockedNetworkRequests: number;
  timerCallbacks: number;
  storage: { local: number; session: number };
  blockedNetworkKinds: Record<string, number>;
  responseReads: string[];
  scriptResources: string[];
  reusedScriptResources: string[];
  eventListeners: string[];
  pendingSdkRequests: number;
  lastFailure?: { name: string; locations: string[] };
  tokenWrites: { msToken: number; xmst: number };
  tokenState: { present: boolean; length: number; hasCompanionToken: boolean };
  cookieTokenState: { present: boolean; matchesStorage: boolean };
  signedTokenMatchesStorage?: boolean;
  signedTokenMatchesCompanion?: boolean;
};
export type { SdkAuxiliaryRequest } from '@datalom/platform-runtime/reverse-core';
export class SdkSession {
  private child: ChildProcessWithoutNullStreams;
  private waiting?: {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  private stopped = false;
  diagnostics?: SdkDiagnostics;
  constructor(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const worker =
      typeof __dirname === 'string'
        ? resolve(__dirname, 'tiktok-sdk-worker.mjs')
        : fileURLToPath(new URL('./tiktok-sdk-worker.mjs', import.meta.url));
    this.child = spawn(
      process.execPath,
      ['--permission', '--allow-fs-read=' + worker, '--max-old-space-size=128', worker],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { NODE_ENV: 'production' },
      },
    );
    // Never forward child stderr: site code can include credentials in exceptions.
    this.child.stderr.resume();
    if (signal) {
      const abort = () => this.fail('SDK_ABORTED');
      signal.addEventListener('abort', abort, { once: true });
      this.child.once('exit', () => signal.removeEventListener('abort', abort));
    }
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', (line) => {
      if (line.length > 1024 * 1024) {
        this.fail('SDK_WORKER_OUTPUT_TOO_LARGE');
        return;
      }
      const slot = this.waiting;
      if (!slot) return;
      clearTimeout(slot.timer);
      this.waiting = undefined;
      try {
        const reply = JSON.parse(line);
        this.diagnostics = reply.result?.diagnostics ?? reply.diagnostics ?? this.diagnostics;
        if (!reply.ok) {
          slot.reject(
            new LabError(
              /^SDK_[A-Z_]{1,60}$/.test(reply.error) ? reply.error : 'SDK_WORKER_FAILED',
            ),
          );
          return;
        }
        slot.resolve(reply.result);
      } catch {
        slot.reject(new LabError('SDK_WORKER_OUTPUT_INVALID'));
      }
    });
    this.child.on('error', () => this.fail('SDK_WORKER_FAILED'));
    this.child.on('exit', () => this.fail('SDK_WORKER_EXITED'));
    this.child.stdin.on('error', () => this.fail('SDK_WORKER_INPUT_FAILED'));
  }
  private fail(code: string) {
    const slot = this.waiting;
    this.waiting = undefined;
    if (slot) {
      clearTimeout(slot.timer);
      slot.reject(new LabError(code));
    }
    this.close();
  }
  private call<T>(value: unknown): Promise<T> {
    if (this.stopped) return Promise.reject(new LabError('SDK_WORKER_CLOSED'));
    if (this.waiting) return Promise.reject(new LabError('SDK_COMMAND_BUSY'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail('SDK_WORKER_TIMEOUT'), 7000);
      this.waiting = { resolve, reject, timer };
      this.child.stdin.write(JSON.stringify(value) + '\n');
    });
  }
  async boot(manifest: ReturnType<typeof loadSdkManifest>, credential: PoolCredential) {
    if (!credential.pageJSState || !credential.browserEnvironment)
      throw new LabError('JS_STATE_REQUIRED');
    const initConfigs = structuredClone([manifest.init.config, ...manifest.init.additionalConfigs]);
    for (const init of initConfigs) {
      // Observed native US initialization (2026-09-16) uses the TTP SDK service,
      // not the historical va-tiktok region embedded in the archived manifest.
      if (credential.pageJSState.bootstrap.region === 'US') init.region = 'ttp';
      if ((init.custom as Record<string, unknown> | undefined)?.ttwid === '$bootstrap.wid') {
        const wid = credential.pageJSState.bootstrap.wid;
        if (typeof wid !== 'string' && typeof wid !== 'number')
          throw new LabError('SDK_BOOTSTRAP_WID_REQUIRED');
        (init.custom as Record<string, unknown>).ttwid = String(wid);
      }
    }
    this.diagnostics = await this.call<SdkDiagnostics>({
      action: 'boot',
      sources: manifest.sources,
      resourceUrls: manifest.resourceUrls,
      initConfigs,
      state: credential.pageJSState,
      environment: credential.browserEnvironment,
    });
    return this.diagnostics;
  }
  async sign(input: string) {
    const unsigned = unsignedSdkTarget(input);
    const result = await this.call<{ url: string; diagnostics: SdkDiagnostics }>({
      action: 'sign',
      url: unsigned,
    });
    this.diagnostics = result.diagnostics;
    return validateSignedTarget(unsigned, result.url);
  }
  async response(
    status: number,
    text: string,
    headers: Record<string, string> = {},
    documentCookie?: string,
  ) {
    this.diagnostics = await this.call<SdkDiagnostics>({
      action: 'response',
      status,
      text,
      headers,
      documentCookie,
    });
    return this.diagnostics;
  }
  async requestFailed() {
    this.diagnostics = await this.call<SdkDiagnostics>({ action: 'request-failed' });
  }
  auxiliary() {
    return this.call<SdkAuxiliaryRequest[]>({ action: 'auxiliary' });
  }
  async auxiliaryResponse(
    id: number,
    status: number,
    text: string,
    headers: Record<string, string>,
  ) {
    this.diagnostics = await this.call<SdkDiagnostics>({
      action: 'auxiliary-response',
      id,
      status,
      text,
      headers,
    });
  }
  close() {
    this.stopped = true;
    if (this.waiting) {
      clearTimeout(this.waiting.timer);
      this.waiting.reject(new LabError('SDK_WORKER_CLOSED'));
      this.waiting = undefined;
    }
    this.child.kill();
  }
}
