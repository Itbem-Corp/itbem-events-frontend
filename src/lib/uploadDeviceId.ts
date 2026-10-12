/**
 * Anonymous per-browser id sent with public moment upload API calls so the
 * backend can count uploads per device. It is a random UUIDv4 with no link to
 * the guest: it travels only in the `X-Upload-Device-Id` header, never in a
 * URL, a log or analytics.
 */

export const UPLOAD_DEVICE_STORAGE_KEY = "eventi.upload.device";
export const UPLOAD_DEVICE_HEADER_NAME = "X-Upload-Device-Id";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUploadDeviceId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_RE.test(value);
}

interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
}

function defaultCrypto(): CryptoLike | undefined {
  return typeof globalThis !== "undefined"
    ? (globalThis.crypto as CryptoLike | undefined)
    : undefined;
}

function formatUuidV4(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/** crypto.randomUUID, then getRandomValues, then Math.random as last resort. */
export function generateUploadDeviceId(
  cryptoImpl: CryptoLike | undefined = defaultCrypto(),
): string {
  try {
    const candidate = cryptoImpl?.randomUUID?.();
    if (isUploadDeviceId(candidate)) return candidate.toLowerCase();
  } catch {
    // Insecure context or unsupported: fall through.
  }
  const bytes = new Uint8Array(16);
  try {
    if (cryptoImpl?.getRandomValues) {
      cryptoImpl.getRandomValues(bytes);
      return formatUuidV4(bytes);
    }
  } catch {
    // Fall through to Math.random.
  }
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return formatUuidV4(bytes);
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface UploadDeviceIdDeps {
  localStorage?: () => StorageLike | undefined;
  sessionStorage?: () => StorageLike | undefined;
  generate?: () => string;
}

let memoryDeviceId: string | null = null;

/** Test hook: forget the in-memory fallback id. */
export function resetUploadDeviceIdMemory(): void {
  memoryDeviceId = null;
}

function readOrCreate(
  getStorage: (() => StorageLike | undefined) | undefined,
  generate: () => string,
): string | null {
  try {
    const storage = getStorage?.();
    if (!storage) return null;
    const stored = storage.getItem(UPLOAD_DEVICE_STORAGE_KEY);
    if (isUploadDeviceId(stored)) return stored;
    const created = memoryDeviceId ?? generate();
    storage.setItem(UPLOAD_DEVICE_STORAGE_KEY, created);
    // Only trust storage that actually kept the value.
    return storage.getItem(UPLOAD_DEVICE_STORAGE_KEY) === created ? created : null;
  } catch {
    return null;
  }
}

function browserStorage(name: "localStorage" | "sessionStorage") {
  return (): StorageLike | undefined =>
    typeof window === "undefined" ? undefined : window[name];
}

/**
 * Returns this browser's upload device id, creating it once. Prefers
 * localStorage, then sessionStorage, then an in-memory id for this page.
 */
export function getUploadDeviceId(deps: UploadDeviceIdDeps = {}): string {
  const generate = deps.generate ?? (() => generateUploadDeviceId());
  const id =
    readOrCreate(deps.localStorage ?? browserStorage("localStorage"), generate) ??
    readOrCreate(deps.sessionStorage ?? browserStorage("sessionStorage"), generate);
  if (id) {
    memoryDeviceId = id;
    return id;
  }
  memoryDeviceId ??= generate();
  return memoryDeviceId;
}

/** Adds the device id header to a request init (headers only, never the URL). */
export function withUploadDeviceHeader(
  init?: RequestInit,
  deviceId: string = getUploadDeviceId(),
): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set(UPLOAD_DEVICE_HEADER_NAME, deviceId);
  return { ...(init ?? {}), headers };
}
