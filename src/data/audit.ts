import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import type { AuditEvent } from '@/domain/audit';
import { getDb } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/live';

/** The team sees the whole log; others see only their own actions. */
export function useAudit(pid: string | undefined, uid: string | undefined, isTeam: boolean) {
  return useLiveQuery(
    pid && uid ? `audit:${pid}:${isTeam ? 'all' : uid}` : null,
    () => {
      const c = collection(getDb(), `properties/${pid}/audit`);
      return isTeam ? query(c, orderBy('at', 'desc'), limit(200)) : query(c, where('actorUid', '==', uid), orderBy('at', 'desc'), limit(200));
    },
    (id, d) => ({ ...(d as unknown as AuditEvent), id }),
  );
}
