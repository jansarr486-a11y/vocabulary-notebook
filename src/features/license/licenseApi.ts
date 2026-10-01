/**
 * License verification API — the only network call in the license feature.
 *
 * POSTs { email, licenseKey } as JSON and returns the parsed outcome.
 * The signature/payload are never interpreted here; they are handed back
 * exactly as received for the caller to store.
 */

/**
 * Activation endpoint. VITE_LICENSE_VERIFY_URL can override this at build
 * time (e.g. for a local mock server during development).
 */
const LICENSE_VERIFY_URL: string =
  import.meta.env.VITE_LICENSE_VERIFY_URL ?? 'https://apivocnote.msalehzadeh.com/verify-license.php';

/** Thrown when the request could not reach the server at all (offline, DNS, CORS…). */
export class NetworkUnavailableError extends Error {
  constructor() {
    super('license verification: network unavailable');
    this.name = 'NetworkUnavailableError';
  }
}

export type VerifyOutcome =
  | { ok: true; payload: unknown; signature: unknown }
  | { ok: false; reason: string };

interface RawResponse {
  valid?: boolean;
  reason?: unknown;
  payload?: unknown;
  signature?: unknown;
}

/**
 * Verify a license against the activation endpoint. Rejects with
 * NetworkUnavailableError when the network itself fails; resolves with
 * ok:false for server-side rejections (unknown key, revoked, expired…).
 * The deviceId identifies this installation (server-side device-limit
 * enforcement); userAgent is a friendly label for the tutor's admin view.
 */
export async function verifyLicense(
  email: string,
  licenseKey: string,
  deviceId: string,
): Promise<VerifyOutcome> {
  let response: Response;
  try {
    response = await fetch(LICENSE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, licenseKey, deviceId, userAgent: navigator.userAgent }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new NetworkUnavailableError();
  }

  let data: RawResponse;
  try {
    data = (await response.json()) as RawResponse;
  } catch {
    return { ok: false, reason: 'generic' };
  }

  if (data.valid === true) {
    // Store exactly what the server sent — payload/signature may be any shape.
    return { ok: true, payload: data.payload ?? null, signature: data.signature ?? null };
  }
  return { ok: false, reason: typeof data.reason === 'string' ? data.reason : 'generic' };
}
