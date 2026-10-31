import { CredentialsService } from './credentials.service';

describe('CredentialsService', () => {
  let service: CredentialsService;
  const masterKey = 'test-master-key-do-not-use-in-prod';

  beforeEach(() => {
    service = new CredentialsService();
  });

  it('should round-trip a plaintext secret', () => {
    const secret = 'wb-api-token-12345';
    const encrypted = service.encrypt(secret, masterKey);
    expect(encrypted).not.toContain(secret);
    expect(service.decrypt(encrypted, masterKey)).toBe(secret);
  });

  it('should produce different ciphertexts for the same plaintext (random IV)', () => {
    const secret = 'same-secret';
    const a = service.encrypt(secret, masterKey);
    const b = service.encrypt(secret, masterKey);
    expect(a).not.toBe(b);
    expect(service.decrypt(a, masterKey)).toBe(secret);
    expect(service.decrypt(b, masterKey)).toBe(secret);
  });

  it('should fail to decrypt with a different master key', () => {
    const encrypted = service.encrypt('secret-value', masterKey);
    expect(() => service.decrypt(encrypted, 'wrong-master-key')).toThrow();
  });

  it('should reject tampered ciphertext', () => {
    const encrypted = service.encrypt('secret-value', masterKey);
    const data = Buffer.from(encrypted, 'base64');
    data[data.length - 1] ^= 0xff; // flip a bit in the ciphertext
    expect(() => service.decrypt(data.toString('base64'), masterKey)).toThrow();
  });

  it('should handle unicode plaintext', () => {
    const secret = 'секрет-продавца';
    expect(service.decrypt(service.encrypt(secret, masterKey), masterKey)).toBe(
      secret,
    );
  });
});
