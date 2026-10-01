import { describe, expect, it } from 'vitest';
import { RECHECK_INTERVAL_MS, generateDeviceUuid, isStale, reasonKey } from './licenseLogic';

describe('license gate logic', () => {
  describe('isStale', () => {
    const last = 1_000_000_000_000;

    it('is not stale within the 14-day window', () => {
      expect(isStale(last, last + RECHECK_INTERVAL_MS - 1)).toBe(false);
      expect(isStale(last, last + 1000)).toBe(false);
    });

    it('is stale once 14 days have passed', () => {
      expect(isStale(last, last + RECHECK_INTERVAL_MS)).toBe(true);
      expect(isStale(last, last + RECHECK_INTERVAL_MS * 30)).toBe(true);
    });
  });

  describe('reasonKey', () => {
    it('maps every documented server reason to its message key', () => {
      expect(reasonKey('not_found')).toBe('lic.err.not_found');
      expect(reasonKey('revoked')).toBe('lic.err.revoked');
      expect(reasonKey('expired')).toBe('lic.err.expired');
      expect(reasonKey('missing_fields')).toBe('lic.err.missing_fields');
      expect(reasonKey('device_limit_reached')).toBe('lic.err.device_limit_reached');
      expect(reasonKey('not_started_yet')).toBe('lic.err.not_started_yet');
    });

    it('falls back to the generic message for unknown or missing reasons', () => {
      expect(reasonKey('something_else')).toBe('lic.err.generic');
      expect(reasonKey(undefined)).toBe('lic.err.generic');
      expect(reasonKey(null)).toBe('lic.err.generic');
    });
  });

  describe('generateDeviceUuid', () => {
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('returns a valid RFC 4122 v4 UUID', () => {
      expect(generateDeviceUuid()).toMatch(UUID_V4);
    });

    it('generates a different UUID on every call', () => {
      const seen = new Set(Array.from({ length: 50 }, () => generateDeviceUuid()));
      expect(seen.size).toBe(50);
    });
  });
});
