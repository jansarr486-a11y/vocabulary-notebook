import Dexie, { type Table } from 'dexie';

/**
 * License storage — a completely separate IndexedDB database so the main
 * `vocabulary-notebook` schema, stores and upgrade path stay untouched.
 * One row, keyed 'current', holding whatever the activation server returned.
 */
export interface LicenseRecord {
  id: 'current';
  /** Email used for activation (kept for the silent periodic re-check). */
  email: string;
  /** License key used for activation (kept for the silent periodic re-check). */
  licenseKey: string;
  /** Server payload, stored exactly as received — never interpreted client-side. */
  payload: unknown;
  /** Server signature, stored exactly as received — never verified client-side. */
  signature: unknown;
  /** Local timestamp of the last successful verification (activation or re-check). */
  lastVerifiedAt: number;
  /**
   * Set when a periodic re-check returned valid:false. The current session
   * keeps working behind a banner; the NEXT app open shows the Activation
   * screen again instead of the app.
   */
  needsAttention?: boolean;
}

const CURRENT_ID = 'current' as const;

class LicenseDb extends Dexie {
  license!: Table<LicenseRecord, string>;

  constructor() {
    super('vocabulary-notebook-license');
    this.version(1).stores({
      license: 'id',
    });
  }
}

const licenseDb = new LicenseDb();

export async function getLicense(): Promise<LicenseRecord | undefined> {
  return licenseDb.license.get(CURRENT_ID);
}

export async function saveLicense(record: LicenseRecord): Promise<void> {
  await licenseDb.license.put(record);
}
