/**
 * Pure license-gate logic — kept side-effect-free so it is unit-testable.
 * Nothing here touches IndexedDB, fetch, React or the rest of the app.
 */

/** How often the stored license is silently re-verified (14 days). */
export const RECHECK_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * True when the stored license has not been re-verified recently enough
 * to justify a silent background re-check.
 */
export function isStale(lastVerifiedAt: number, now: number): boolean {
  return now - lastVerifiedAt >= RECHECK_INTERVAL_MS;
}

/**
 * Map a server "reason" field to a translation key. Unknown / missing
 * reasons fall back to the generic failure message.
 */
export function reasonKey(reason: string | undefined | null): string {
  switch (reason) {
    case 'not_found':
    case 'revoked':
    case 'expired':
    case 'missing_fields':
    case 'device_limit_reached':
    case 'not_started_yet':
      return `lic.err.${reason}`;
    default:
      return 'lic.err.generic';
  }
}

/**
 * Random UUID identifying this installation to the license server.
 * Uses the platform crypto API when available; falls back to an
 * equivalent RFC 4122 v4 UUID (crypto.getRandomValues, then Math.random)
 * on older browsers. Generated once and never changed afterwards.
 */
export function generateDeviceUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Version 4 + RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
