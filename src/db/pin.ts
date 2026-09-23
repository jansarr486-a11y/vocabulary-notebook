/**
 * Optional 4-digit PIN "kid-lock".
 * Honestly labelled in the UI as a gentle lock, not real security — a salted
 * SHA-256 hash is enough to stop a sibling casually opening a profile.
 */
const enc = new TextEncoder();

export function makeSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt?: string): Promise<{ pinHash: string; pinSalt: string }> {
  const useSalt = salt ?? makeSalt();
  const data = enc.encode(`${useSalt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { pinHash: hash, pinSalt: useSalt };
}

export async function verifyPin(pin: string, pinHash: string, pinSalt: string): Promise<boolean> {
  const { pinHash: candidate } = await hashPin(pin, pinSalt);
  // constant-time-ish compare
  if (candidate.length !== pinHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ pinHash.charCodeAt(i);
  return diff === 0;
}
