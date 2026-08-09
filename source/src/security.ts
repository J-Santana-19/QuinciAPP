import type { PinRecord } from "./types";

const DEFAULT_ITERATIONS = 240_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePinHash(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  if (!/^\d{6,8}$/.test(pin)) throw new Error("El PIN debe tener entre 6 y 8 dígitos.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    salt: bytesToBase64(salt),
    hash: await derivePinHash(pin, salt, DEFAULT_ITERATIONS),
    iterations: DEFAULT_ITERATIONS,
  };
}

export async function createLegacyPinRecord(pin: string): Promise<PinRecord | undefined> {
  if (!/^\d{4,8}$/.test(pin)) return undefined;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    salt: bytesToBase64(salt),
    hash: await derivePinHash(pin, salt, DEFAULT_ITERATIONS),
    iterations: DEFAULT_ITERATIONS,
  };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const candidate = await derivePinHash(pin, base64ToBytes(record.salt), record.iterations);
  if (candidate.length !== record.hash.length) return false;
  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ record.hash.charCodeAt(index);
  }
  return difference === 0;
}
