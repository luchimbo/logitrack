import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const keyHex = String(process.env.ZIPNOVA_ENCRYPTION_KEY || '').trim();
  if (!keyHex) {
    throw new Error('ZIPNOVA_ENCRYPTION_KEY no está configurado');
  }
  if (!/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error('ZIPNOVA_ENCRYPTION_KEY debe ser una cadena hexadecimal de 64 caracteres (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
}

export function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const bundle = Buffer.concat([iv, authTag, encrypted]);
  return bundle.toString('base64');
}

export function decrypt(encryptedBase64) {
  const key = getKey();
  const bundle = Buffer.from(String(encryptedBase64), 'base64');
  if (bundle.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Datos encriptados inválidos');
  }
  const iv = bundle.subarray(0, IV_LENGTH);
  const authTag = bundle.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = bundle.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
