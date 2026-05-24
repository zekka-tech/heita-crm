const REQUEST_ID_HEADER = "x-request-id";
const MAX_LENGTH = 64;
const VALID_PATTERN = /^[A-Za-z0-9._:-]{4,64}$/;

export const requestIdHeader = REQUEST_ID_HEADER;

export function isValidRequestId(value: string): boolean {
  return value.length <= MAX_LENGTH && VALID_PATTERN.test(value);
}

export function generateRequestId(): string {
  // Web Crypto is available in both Node 19+ and the Edge runtime.
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Last-resort fallback (should not happen in practice).
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function resolveRequestId(headers: Headers): string {
  const provided = headers.get(REQUEST_ID_HEADER);
  if (provided && isValidRequestId(provided)) {
    return provided;
  }
  return generateRequestId();
}
