import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV, recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const KEY_LENGTH = 32; // 256-bit key
const KDF_SALT = 'app-template::credentials::v1';

/**
 * Encrypts/decrypts sensitive values at rest using AES-256-GCM.
 *
 * The caller supplies a high-entropy master key (from a secret manager, e.g.
 * `APP_ENCRYPTION_KEY`); this service never logs or returns it.
 * Ciphertext format: base64(iv || authTag || ciphertext).
 */
@Injectable()
export class CredentialsService {
  encrypt(plaintext: string, masterKey: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.deriveKey(masterKey), iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  decrypt(payload: string, masterKey: string): string {
    const data = Buffer.from(payload, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.deriveKey(masterKey), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    );
  }

  private deriveKey(masterKey: string): Buffer {
    return scryptSync(masterKey, KDF_SALT, KEY_LENGTH);
  }
}
