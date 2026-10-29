import { arrayUnion, collection, collectionGroup, deleteField, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { requiredAuditId } from '@/domain/audit';
import { todayIn } from '@/domain/dates';
import { blankItem, buildRooms, contentHash, createRoom, itemFieldPath, nextOrder, sortedItems, withCondition } from '@/domain/inspection/logic';
import { getTemplateSet } from '@/domain/inspection/templates';
import type { Agreement, EvidenceRecord, Inspection, InspectionItem, InspectionRoom, InspectionSignature, InspectionType, ItemCondition, RoomType } from '@/domain/inspection/types';
import { INSPECTION_TYPE_LABELS } from '@/domain/inspection/types';
import { newId } from '@/domain/ids';
import { formatAddress, type Property } from '@/domain/property';
import { TEAM_ROLES } from '@/domain/roles';
import { getMarket } from '@/config/markets';
import { getDb } from '@/lib/firebase';
import { useLiveDoc, useLiveQuery } from '@/lib/live';
import { addAudit, clean, type Actor } from './common';

export function mapInspection(id: string, d: Record<string, unknown>): Inspection {
  const i = d as unknown as Inspection;
  return { ...i, id, rooms: i.rooms ?? {}, participantIds: i.participantIds ?? [], editorIds: i.editorIds ?? [], parties: i.parties ?? {} };
}

const inspPath = (pid: string, iid: string) => `properties/${pid}/inspections/${iid}`;

export function useInspection(pid: string | undefined, iid: string | undefined) {
  return useLiveDoc(pid && iid ? `insp:${pid}:${iid}` : null, () => doc(getDb(), inspPath(pid!, iid!)), mapInspection);
}

/** Two queries the rules can prove: inspections I take part in, plus (for the team) team-visible ones. */
export function usePropertyInspections(pid: string | undefined, uid: string | undefined, isTeam: boolean) {
  const mine = useLiveQuery(pid && uid ? `insp-mine:${pid}:${uid}` : null, () => query(collection(getDb(), `properties/${pid}/inspections`), where('participantIds', 'array-contains', uid)), mapInspection);
  const team = useLiveQuery(pid && uid && isTeam ? `insp-team:${pid}` : null, () => query(collection(getDb(), `properties/${pid}/inspections`), where('teamVisible', '==', true)), mapInspection);
  const byId = new Map<string, Inspection>();
  for (const i of [...mine.data, ...team.data]) byId.set(i.id, i);
  return { data: [...byId.values()], loading: mine.loading || team.loading, error: mine.error ?? team.error };
}

/** Every inspection this person took part in, across all properties, including ones they have left. */
export function useMyInspections(uid: string | undefined) {
  return useLiveQuery(uid ? `insp-all:${uid}` : null, () => query(collectionGroup(getDb(), 'inspections'), where('participantIds', 'array-contains', uid)), mapInspection);
}

export function useEvidence(pid: string | undefined, iid: string | undefined) {
  return useLiveQuery(pid && iid ? `ev:${pid}:${iid}` : null, () => collection(getDb(), `${inspPath(pid!, iid!)}/evidence`), (id, d) => ({ ...(d as unknown as EvidenceRecord), id }));
}

export function useSignatures(pid: string | undefined, iid: string | undefined) {
  return useLiveQuery(pid && iid ? `sig:${pid}:${iid}` : null, () => collection(getDb(), `${inspPath(pid!, iid!)}/signatures`), (id, d) => ({ ...(d as unknown as InspectionSignature), uid: id }));
}

export interface NewInspectionInput {
  type: InspectionType;
  title: string;
  inspectionDate: string;
  tenancyId?: string;
  roomTypes: RoomType[];
  parties: Inspection['parties'];
  /** Linked tenancy parties to include as participants from the start. */
  shareWith: string[];
}

export async function createInspection(p: Property, input: NewInspectionInput, actor: Actor): Promise<string> {
  const db = getDb();
  const role = p.members[actor.uid]?.role;
  if (!role) throw new Error('Not a member of this property.');
  const team = p.ownerUid === actor.uid || TEAM_ROLES.includes(role);
  const market = getMarket(p.marketId);
  const ref = doc(collection(db, `properties/${p.id}/inspections`));
  const b = writeBatch(db);
  b.set(
    ref,
    clean({
      propertyId: p.id,
      propertyName: p.name,
      propertyAddress: formatAddress(p.address, p.unitNumber),
      tenancyId: input.tenancyId || undefined,
      type: input.type,
      title: input.title.trim() || INSPECTION_TYPE_LABELS[input.type],
      inspectionDate: input.inspectionDate || todayIn(market.timeZone),
      status: 'draft',
      templateSet: market.inspectionTemplateSet,
      rooms: buildRooms(input.roomTypes, market.inspectionTemplateSet),
      generalNotes: '',
      parties: clean(input.parties),
      participantIds: [...new Set([actor.uid, ...input.shareWith.filter((u) => p.memberIds.includes(u))])],
      editorIds: [actor.uid],
      teamVisible: team,
      createdBy: actor.uid,
      createdByName: actor.name,
      createdByRole: role,
      createdByTeam: team,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  addAudit(b, p.id, actor, { action: 'inspection.created', kind: 'create', target: { type: 'inspection', id: ref.id }, summary: `${actor.name} started ${INSPECTION_TYPE_LABELS[input.type].toLowerCase()} inspection` });
  await b.commit();
  return ref.id;
}

/**
 * Checklist edits write single field paths so two people (or two devices) editing different items never
 * overwrite each other. They are not awaited by the UI: the local cache shows them at once and syncs later.
 */
export function updateItem(i: Inspection, roomId: string, item: InspectionItem, patch: Partial<InspectionItem>, actor: Actor) {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  const full = 'condition' in patch ? { ...withCondition(item, patch.condition ?? null), ...patch } : patch;
  for (const [k, v] of Object.entries(full)) data[itemFieldPath(roomId, item.id, k as keyof InspectionItem)] = v;
  data[itemFieldPath(roomId, item.id, 'updatedAt')] = new Date().toISOString();
  data[itemFieldPath(roomId, item.id, 'updatedBy')] = actor.uid;
  return updateDoc(doc(getDb(), inspPath(i.propertyId, i.id)), data);
}

export function setCondition(i: Inspection, roomId: string, item: InspectionItem, condition: ItemCondition | null, actor: Actor) {
  return updateItem(i, roomId, item, { condition: item.condition === condition ? null : condition }, actor);
}

/** Marks every unchecked item in a room. Never touches items that already have a condition. */
export function markRemaining(i: Inspection, room: InspectionRoom, condition: ItemCondition, actor: Actor) {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  const now = new Date().toISOString();
  for (const item of sortedItems(room)) {
    if (item.condition !== null) continue;
    data[itemFieldPath(room.id, item.id, 'condition')] = condition;
    data[itemFieldPath(room.id, item.id, 'updatedAt')] = now;
    data[itemFieldPath(room.id, item.id, 'updatedBy')] = actor.uid;
  }
  return updateDoc(doc(getDb(), inspPath(i.propertyId, i.id)), data);
}

export function addRoom(i: Inspection, type: RoomType, name: string, withItems: boolean) {
  const room = createRoom({ type, name, order: nextOrder(Object.values(i.rooms)), templateSet: i.templateSet, custom: true, withItems });
  return updateDoc(doc(getDb(), inspPath(i.propertyId, i.id)), { [`rooms.${room.id}`]: room, updatedAt: serverTimestamp() }).then(() => room.id);
}

export function renameRoom(i: Inspection, roomId: string, name: string) {
  return updateDoc(doc(getDb(), inspPath(i.propertyId, i.id)), { [`rooms.${roomId}.name`]: name.trim().slice(0, 80), updatedAt: serverTimestamp() });
}

export function setRoomNotes(i: Inspection, roomId: string, notes: string) {
  return updateDoc(doc(getDb(), inspPath(i.propertyId, i.id)), { [`rooms.${roomId}.notes`]: notes, updatedAt: serverTimestamp() });
}

/** Only rooms without evidence can be removed from a draft; evidence is never orphaned. */
export function removeRoom(i: Inspection, roomId: string) {
  return updateDoc(doc(getDb(), inspPath(i.propertyId, i.id)), { [`rooms.${roomId}`]: deleteField(), updatedAt: serverTimestamp() });
}

export function addItem(i: Inspection, room: InspectionRoom, label: string) {
  const id = newId(10);
  const item = blankItem({ id, label: label.trim().slice(0, 120), group: 'custom', order: nextOrder(Object.values(room.items)), custom: true });
  return updateDoc(doc(getDb(), inspPath(i.propertyId, i.id)), { [`rooms.${room.id}.items.${id}`]: item, updatedAt: serverTimestamp() });
}

export function removeCustomItem(i: Inspection, roomId: string, itemId: string) {
  return updateDoc(doc(getDb(), inspPath(i.propertyId, i.id)), { [`rooms.${roomId}.items.${itemId}`]: deleteField(), updatedAt: serverTimestamp() });
}

export function updateInspectionDetails(i: Inspection, patch: Partial<Pick<Inspection, 'title' | 'inspectionDate' | 'generalNotes' | 'parties'>>) {
  return updateDoc(doc(getDb(), inspPath(i.propertyId, i.id)), clean({ ...patch, updatedAt: serverTimestamp() }));
}

/** Template groups not yet in a room, so people can add a whole section back. */
export function missingTemplateItems(i: Inspection, room: InspectionRoom): string[] {
  const have = new Set(Object.values(room.items).map((x) => x.label));
  return getTemplateSet(i.templateSet)[room.type].groups.flatMap((g) => g.items).filter((l) => !have.has(l));
}

/**
 * Completes the inspection: computes the content hash over the checklist and the evidence files'
 * hashes, freezes the record (the rules forbid later checklist edits), and writes the required audit
 * event in the same batch. Completion must happen online so it gets the server's time.
 */
export async function completeInspection(i: Inspection, actor: Actor): Promise<string> {
  const db = getDb();
  const evSnap = await getDocs(collection(db, `${inspPath(i.propertyId, i.id)}/evidence`));
  const evidence = evSnap.docs.map((d) => d.data() as EvidenceRecord);
  const hash = await contentHash(i, evidence);
  const b = writeBatch(db);
  b.update(doc(db, inspPath(i.propertyId, i.id)), { status: 'completed', completedBy: actor.uid, completedAt: serverTimestamp(), contentHash: hash, updatedAt: serverTimestamp() });
  addAudit(
    b,
    i.propertyId,
    actor,
    { action: 'inspection.completed', kind: 'create', target: { type: 'inspection', id: i.id }, summary: `${actor.name} completed "${i.title}"`, details: { contentHash: hash, evidenceCount: evidence.length } },
    requiredAuditId.inspectionCompleted(i.id),
  );
  await b.commit();
  return hash;
}

export async function shareInspection(i: Inspection, opts: { addParticipants?: string[]; teamVisible?: boolean }, actor: Actor) {
  const db = getDb();
  const b = writeBatch(db);
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (opts.addParticipants?.length) patch.participantIds = arrayUnion(...opts.addParticipants);
  if (opts.teamVisible) patch.teamVisible = true;
  b.update(doc(db, inspPath(i.propertyId, i.id)), patch);
  addAudit(b, i.propertyId, actor, {
    action: 'inspection.shared',
    kind: 'access',
    target: { type: 'inspection', id: i.id },
    summary: `${actor.name} shared "${i.title}"${opts.teamVisible ? ' with the property team' : ''}${opts.addParticipants?.length ? ` with ${opts.addParticipants.length} person(s)` : ''}`,
  });
  await b.commit();
}

export async function voidInspection(i: Inspection, reason: string, actor: Actor) {
  const db = getDb();
  const b = writeBatch(db);
  b.update(doc(db, inspPath(i.propertyId, i.id)), { status: 'void', voidReason: reason.trim(), updatedAt: serverTimestamp() });
  addAudit(b, i.propertyId, actor, { action: 'inspection.voided', kind: 'void', target: { type: 'inspection', id: i.id }, summary: `${actor.name} voided "${i.title}": ${reason.trim().slice(0, 200)}` });
  await b.commit();
}

export async function signInspection(
  i: Inspection,
  s: { name: string; role: InspectionSignature['role']; agreement: Agreement; comment: string; disputedItemIds: string[]; signatureImage: string },
  actor: Actor,
) {
  if (!i.contentHash) throw new Error('Only completed inspections can be signed.');
  const db = getDb();
  const b = writeBatch(db);
  b.set(doc(db, `${inspPath(i.propertyId, i.id)}/signatures/${actor.uid}`), {
    uid: actor.uid,
    name: s.name,
    role: s.role,
    acknowledgedReceipt: true,
    agreement: s.agreement,
    comment: s.comment.trim(),
    disputedItemIds: s.disputedItemIds,
    signatureImage: s.signatureImage,
    contentHash: i.contentHash,
    signedAt: serverTimestamp(),
  });
  addAudit(
    b,
    i.propertyId,
    actor,
    {
      action: 'inspection.signed',
      kind: s.agreement === 'agree' ? 'agreement' : 'disagreement',
      target: { type: 'inspection', id: i.id },
      summary: `${actor.name} acknowledged "${i.title}" and ${s.agreement === 'agree' ? 'agreed' : s.agreement === 'partial' ? 'partly agreed' : 'disagreed'}`,
      details: { disputedItems: s.disputedItemIds.length },
    },
    requiredAuditId.inspectionSigned(i.id, actor.uid),
  );
  await b.commit();
}
