import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync
} from "node:crypto";

/**
 * Application-level encryption for third-party credentials stored in Postgres
 * (e.g. bring-your-own-model API keys). AES-256-GCM with a key derived from
 * AI_CREDENTIALS_SECRET (falling back to AUTH_SECRET so existing deployments
 * work without a new variable).
 *
 * Ciphertext format (versioned so the scheme can rotate):
 *   v1.<iv b64url>.<authTag b64url>.<ciphertext b64url>
 */

const VERSION = "v1";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
// Static, app-scoped salt: the input secret is already high-entropy; scrypt
// here only stretches/normalises it to exactly 32 bytes.
const KDF_SALT = "heita.ai-provider-credentials.v1";

let cachedKey: { secret: string; key: Buffer } | null = null;

function getEncryptionKey(): Buffer {
  const secret = process.env.AI_CREDENTIALS_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "secret-crypto: set AI_CREDENTIALS_SECRET (or AUTH_SECRET) to encrypt provider credentials"
    );
  }
  if (cachedKey?.secret !== secret) {
    cachedKey = { secret, key: scryptSync(secret, KDF_SALT, KEY_LENGTH) };
  }
  return cachedKey.key;
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart, ...rest] = payload.split(".");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart || rest.length > 0) {
    throw new Error("secret-crypto: unrecognised ciphertext format");
  }
  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
