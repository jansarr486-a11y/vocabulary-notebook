import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../db/models';
import { createProfile, getMeta, getProfile, listProfiles, setMeta } from '../db/repo';

type Status = 'loading' | 'gate' | 'pin' | 'ready';

interface ProfileContextValue {
  status: Status;
  profiles: Profile[];
  profile: Profile | undefined;
  /** Pick a profile from the gate — routes to PIN entry when protected. */
  choose: (id: number) => Promise<void>;
  /** Enter a profile (assumes PIN already handled by caller if set). */
  activate: (id: number) => Promise<void>;
  signOut: () => Promise<void>;
  createNew: (name: string, accent: string, pin?: string) => Promise<Profile>;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

const ACTIVE_KEY = 'activeProfileId';

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<Profile | undefined>();

  const load = useCallback(async () => {
    const all = await listProfiles();
    setProfiles(all);
    return all;
  }, []);

  // Initial load: resolve active profile from IndexedDB
  useEffect(() => {
    (async () => {
      const all = await load();
      const activeId = await getMeta<number>(ACTIVE_KEY);
      const found = all.find((p) => p.id === activeId);
      if (found) {
        setProfile(found);
        setStatus(found.pinHash ? 'pin' : 'ready');
      } else {
        setStatus('gate');
      }
    })();
  }, [load]);

  // Both resolve from the DB — never from a stale render-time list.
  const activate = useCallback(async (id: number) => {
    const p = await getProfile(id);
    if (!p) return;
    await setMeta(ACTIVE_KEY, id);
    setProfile(p);
    setStatus('ready');
  }, []);

  const choose = useCallback(
    async (id: number) => {
      const p = await getProfile(id);
      if (!p) return;
      await setMeta(ACTIVE_KEY, id);
      setProfile(p);
      setStatus(p.pinHash ? 'pin' : 'ready');
    },
    [],
  );

  const signOut = useCallback(async () => {
    await setMeta(ACTIVE_KEY, undefined);
    setProfile(undefined);
    setStatus('gate');
  }, []);

  const createNew = useCallback(
    async (name: string, accent: string, pin?: string) => {
      const p = await createProfile(name, accent, pin);
      await load();
      await activate(p.id!);
      return p;
    },
    [activate, load],
  );

  return (
    <ProfileContext.Provider
      value={{
        status,
        profiles,
        profile,
        choose,
        activate,
        signOut,
        createNew,
        refresh: async () => {
          const all = await load();
          setProfile((prev) => (prev ? (all.find((p) => p.id === prev.id) ?? prev) : prev));
        },
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfiles(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfiles must be used inside ProfileProvider');
  return ctx;
}
