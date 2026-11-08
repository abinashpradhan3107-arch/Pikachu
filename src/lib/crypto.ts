import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

function getAppSecret(): Buffer {
  const configured = process.env.APP_SECRET;
  if (configured && configured.length >= 16) {
    return createHash("sha256").update(configured).digest();
  }
  const dir = path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "app-secret");
  if (existsSync(file)) {
    return Buffer.from(readFileSync(file, "utf8").trim(), "hex");
  }
  const secret = randomBytes(32);
  writeFileSync(file, secret.toString("hex"), { mode: 0o600 });
  return secret;
}

export function encryptSecret(plaintext: string): string {
  const key = getAppSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [ivPart, tagPart, dataPart] = payload.split(".");
    if (!ivPart || !tagPart || !dataPart) return null;
    const key = getAppSecret();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 3)}••••••••${value.slice(-4)}`;
}
