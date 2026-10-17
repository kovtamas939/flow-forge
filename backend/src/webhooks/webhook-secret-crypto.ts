import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const NONCE_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

export type EncryptedWebhookSecret = {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
};

function assertEncryptionKey(key: Buffer): void {
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error("Webhook encryption key must be exactly 32 bytes");
  }
}

export function encryptWebhookSecret(
  secret: string,
  key: Buffer,
): EncryptedWebhookSecret {
  assertEncryptionKey(key);

  const nonce = randomBytes(NONCE_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext,
    nonce,
    authTag: cipher.getAuthTag(),
  };
}

export function decryptWebhookSecret(
  encryptedSecret: EncryptedWebhookSecret,
  key: Buffer,
): string {
  assertEncryptionKey(key);

  if (
    encryptedSecret.nonce.length !== NONCE_LENGTH_BYTES ||
    encryptedSecret.authTag.length !== AUTH_TAG_LENGTH_BYTES
  ) {
    throw new Error("Stored webhook secret has invalid encryption metadata");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    encryptedSecret.nonce,
    {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    },
  );

  decipher.setAuthTag(encryptedSecret.authTag);

  const plaintext = Buffer.concat([
    decipher.update(encryptedSecret.ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}