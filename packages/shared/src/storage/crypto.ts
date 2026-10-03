import { createDecipheriv, randomBytes, createHash, createHmac } from 'node:crypto';
import { Entry } from '@napi-rs/keyring';
import { resolve } from 'node:path';

export function loadMasterKey(dataDir: string, allowCreate = true): Buffer {

  const entry = new Entry(
    'datalom',
    `master-${createHash('sha256').update(resolve(dataDir)).digest('hex').slice(0, 24)}`,
  );

  const existing = entry.getPassword();
  if (existing) {
    const key = Buffer.from(existing, 'base64');
    if (key.length !== 32) throw new Error('Invalid system keyring key');
    return key;
  }
  if (!allowCreate)
    throw new Error(
      'Datalom 数据已存在，但系统凭据库中缺少主密钥。请恢复原密钥，不要覆盖现有数据。',
    );
  const key = randomBytes(32);
  entry.setPassword(key.toString('base64'));
  return key;
}

export class Vault {
  constructor(private key: Buffer) {
    if (key.length !== 32) throw new Error('AES-256 requires 32 bytes');
  }
  /** Domain-separated signing key, stable across restarts with the same Vault master key. */
  userSigningKey(): Buffer {
    return createHmac('sha256', this.key).update('datalom:user-jwt:v1').digest();
  }
  /** Plain JSON serialization; context is retained for caller compatibility. */
  seal(value: unknown, context: string): string {
    return JSON.stringify(value);
  }

  open<T>(value: string, context: string): T {
    if (!value.startsWith('v1.')) return JSON.parse(value);
    // Read-only compatibility for existing encrypted records. New writes are plain JSON.
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1') throw new Error('Unknown encryption version');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(),
    );
  }
}
