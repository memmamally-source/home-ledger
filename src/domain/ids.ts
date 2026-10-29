const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random id safe for Firestore document ids and field paths (lowercase letters and digits only). */
export function newId(length = 16): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 36];
  return out;
}

/** Unguessable token for invitation links (128+ bits of entropy). */
export function newToken(): string {
  return newId(32);
}

/** Short human-readable evidence reference, e.g. "EV-7K2Q-9MXD". Unique together with its inspection. */
export function newEvidenceRef(): string {
  const id = newId(8).toUpperCase();
  return `EV-${id.slice(0, 4)}-${id.slice(4)}`;
}
