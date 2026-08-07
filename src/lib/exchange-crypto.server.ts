// Server-only: AES-GCM encryption for exchange API credentials.
// Credentials are never returned to the browser in any form.

const enc = new TextEncoder();
const dec = new TextDecoder();

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = process.env["EXCHANGE_ENCRYPTION_KEY"];
    if (!secret) throw new Error("Encryption key is not configured");
    keyPromise = crypto.subtle
      .digest("SHA-256", enc.encode(secret))
      .then((raw) =>
        crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]),
      );
  }
  return keyPromise;
}

function toB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(value: string) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)),
  );
  return `v1.${toB64(iv)}.${toB64(cipher)}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [version, ivB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !dataB64) throw new Error("Corrupt credential payload");
  const key = await getKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    key,
    fromB64(dataB64),
  );
  return dec.decode(plain);
}

export function maskKey(value: string) {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
