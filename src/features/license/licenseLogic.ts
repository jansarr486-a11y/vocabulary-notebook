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
      return `lic.err.${reason}`;
    default:
      return 'lic.err.generic';
  }
}
