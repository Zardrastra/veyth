// UTF-8 safe Base64 helpers (btoa/atob only handle Latin-1 on their own).

export function bytesToBase64(bytes: Uint8Array, url = false): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  return url ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b64;
}

/** Accepts both standard and URL-safe alphabets, with or without padding. Throws on bad input. */
export function base64ToBytes(input: string): Uint8Array {
  let s = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (s.length % 4 === 1) throw new Error("Invalid Base64 length");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function base64Encode(text: string, url = false): string {
  return bytesToBase64(new TextEncoder().encode(text), url);
}

export function base64Decode(input: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(input));
}

export function bytesToHex(bytes: Uint8Array, upper = false): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return upper ? hex.toUpperCase() : hex;
}

/** Hex → UTF-8 text. Ignores whitespace, `0x` prefixes and `:`/`-` separators. */
export function hexDecode(input: string): string {
  const s = input.replace(/0x/gi, "").replace(/[\s:-]+/g, "");
  if (!/^[0-9a-f]*$/i.test(s)) throw new Error("Hex may only contain 0-9 and a-f");
  if (s.length % 2) throw new Error("Hex needs an even number of digits");
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
