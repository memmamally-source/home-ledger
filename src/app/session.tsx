import { onAuthStateChanged, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMarket, type Market } from '@/config/markets';
import type { Actor } from '@/data/common';
import { ensureProfile, useProfile, type UserProfile } from '@/data/users';
import { getAuthInstance } from '@/lib/firebase';

export interface Session {
  user: User | null;
  profile: UserProfile | null;
  /** True until both the auth state and (when signed in) the profile are known. */
  loading: boolean;
  actor: Actor;
  market: Market;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(
    () =>
      onAuthStateChanged(getAuthInstance(), (u) => {
        if (u) void ensureProfile(u.uid, { displayName: u.displayName || u.email?.split('@')[0] || 'Me', email: u.email ?? '' }).catch(() => undefined);
        setUser(u);
      }),
    [],
  );
  const profile = useProfile(user?.uid ?? null);
  const loading = user === undefined || (Boolean(user) && profile.loading) || (Boolean(user) && !profile.data && !profile.error);
  const name = profile.data?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Me';
  const value: Session = {
    user: user ?? null,
    profile: profile.data,
    loading,
    actor: { uid: user?.uid ?? '', name },
    market: getMarket(profile.data?.marketId),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

/** For screens behind the auth gate: the user and profile are guaranteed. */
export function useAuthed() {
  const s = useSession();
  if (!s.user || !s.profile) throw new Error('useAuthed used without a signed-in user');
  return { ...s, user: s.user, profile: s.profile };
}
