import Dexie, { type Table } from 'dexie';
import { generateDeviceUuid } from './licenseLogic';

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
const DEVICE_ID = 'device' as const;

/**
 * Per-installation device identity, stored permanently as its own row in
 * the same `license` store. Written once on first launch (even before any
 * activation succeeds) and never changed afterwards.
 */
interface DeviceRow {
  id: 'device';
  deviceId: string;
}

class LicenseDb extends Dexie {
  license!: Table<LicenseRecord | DeviceRow, string>;

  constructor() {
    super('vocabulary-notebook-license');
    this.version(1).stores({
      license: 'id',
    });
  }
}

const licenseDb = new LicenseDb();

export async function getLicense(): Promise<LicenseRecord | undefined> {
  const row = await licenseDb.license.get(CURRENT_ID);
  return row && row.id === 'current' ? (row as LicenseRecord) : undefined;
}

export async function saveLicense(record: LicenseRecord): Promise<void> {
  await licenseDb.license.put(record);
}

/**
 * The stable device ID for this installation, creating and persisting it
 * on first call. All subsequent calls return the exact same value.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const row = await licenseDb.license.get(DEVICE_ID);
  if (row && row.id === 'device' && typeof row.deviceId === 'string' && row.deviceId) {
    return row.deviceId;
  }
  const deviceId = generateDeviceUuid();
  await licenseDb.license.put({ id: DEVICE_ID, deviceId });
  return deviceId;
}
