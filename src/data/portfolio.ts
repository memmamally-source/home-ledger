import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Tenancy } from '@/domain/tenancy';
import { getDb } from '@/lib/firebase';
import { mapTenancy } from './tenancies';

/** Live tenancies for every property the person's team runs (one listener per property). */
export function useTeamTenancies(propertyIds: string[]) {
  const key = [...propertyIds].sort().join(',');
  const [state, setState] = useState<{ key: string; map: Map<string, Tenancy[]>; ready: Set<string> }>({ key: '', map: new Map(), ready: new Set() });
  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    const unsubs = ids.map((pid) =>
      onSnapshot(
        collection(getDb(), `properties/${pid}/tenancies`),
        (snap) =>
          setState((s) => {
            const base = s.key === key ? s : { key, map: new Map(), ready: new Set<string>() };
            const map = new Map(base.map);
            map.set(pid, snap.docs.map((d) => mapTenancy(d.id, d.data())));
            return { key, map, ready: new Set([...base.ready, pid]) };
          }),
        () =>
          setState((s) => {
            const base = s.key === key ? s : { key, map: new Map(), ready: new Set<string>() };
            return { ...base, key, ready: new Set([...base.ready, pid]) };
          }),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);
  const current = state.key === key ? state : null;
  return { map: current?.map ?? new Map<string, Tenancy[]>(), loading: Boolean(key) && (!current || current.ready.size < propertyIds.length) };
}
