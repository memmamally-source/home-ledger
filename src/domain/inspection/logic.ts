import { canonicalJson, sha256Hex } from '../hash';
import { newId } from '../ids';
import { getTemplateSet } from './templates';
import type { EvidenceRecord, Inspection, InspectionItem, InspectionRoom, ItemCondition, RoomType, Severity } from './types';

export function createRoom(opts: { type: RoomType; name?: string; order: number; templateSet: string; custom?: boolean; withItems?: boolean }): InspectionRoom {
  const template = getTemplateSet(opts.templateSet)[opts.type];
  const items: Record<string, InspectionItem> = {};
  let order = 0;
  if (opts.withItems !== false) {
    for (const group of template.groups) {
      for (const label of group.items) {
        const id = newId(10);
        items[id] = blankItem({ id, label, group: group.key, order: order++, custom: false });
      }
    }
  }
  return {
    id: newId(10),
    name: opts.name?.trim() || template.label,
    type: opts.type,
    order: opts.order,
    notes: '',
    custom: opts.custom ?? false,
    items,
  };
}

export function blankItem(p: { id: string; label: string; group: string; order: number; custom: boolean }): InspectionItem {
  return { ...p, condition: null, comment: '', defectDescription: '', severity: null, followUp: false };
}

/** Names rooms of the same type "Bedroom 1", "Bedroom 2" so they can be told apart. */
export function buildRooms(types: RoomType[], templateSet: string): Record<string, InspectionRoom> {
  const counts = new Map<RoomType, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const seen = new Map<RoomType, number>();
  const rooms: Record<string, InspectionRoom> = {};
  types.forEach((type, order) => {
    const n = (seen.get(type) ?? 0) + 1;
    seen.set(type, n);
    const base = getTemplateSet(templateSet)[type].label;
    const room = createRoom({ type, order, templateSet, name: (counts.get(type) ?? 0) > 1 ? `${base} ${n}` : base });
    rooms[room.id] = room;
  });
  return rooms;
}

export function sortedRooms(rooms: Record<string, InspectionRoom>): InspectionRoom[] {
  return Object.values(rooms).sort((a, b) => a.order - b.order);
}

export function sortedItems(room: InspectionRoom): InspectionItem[] {
  return Object.values(room.items).sort((a, b) => a.order - b.order);
}

/** Items grouped in template order, custom items last. */
export function groupedItems(room: InspectionRoom): { group: string; items: InspectionItem[] }[] {
  const out: { group: string; items: InspectionItem[] }[] = [];
  for (const item of sortedItems(room)) {
    let g = out.find((x) => x.group === item.group);
    if (!g) {
      g = { group: item.group, items: [] };
      out.push(g);
    }
    g.items.push(item);
  }
  return out;
}

export interface Progress {
  total: number;
  checked: number;
  unchecked: number;
  good: number;
  defective: number;
  notTested: number;
  na: number;
  percent: number;
}

export function progressOf(items: InspectionItem[]): Progress {
  const count = (c: ItemCondition | null) => items.filter((i) => i.condition === c).length;
  const total = items.length;
  const unchecked = count(null);
  const checked = total - unchecked;
  return {
    total,
    checked,
    unchecked,
    good: count('good'),
    defective: count('defective'),
    notTested: count('not_tested'),
    na: count('na'),
    percent: total === 0 ? 0 : Math.round((checked / total) * 100),
  };
}

export function inspectionProgress(rooms: Record<string, InspectionRoom>): Progress {
  return progressOf(Object.values(rooms).flatMap((r) => Object.values(r.items)));
}

export function roomProgress(room: InspectionRoom): Progress {
  return progressOf(Object.values(room.items));
}

export interface DefectRow {
  room: InspectionRoom;
  item: InspectionItem;
}

const SEVERITY_RANK: Record<Severity, number> = { urgent: 0, major: 1, moderate: 2, minor: 3 };

export function defectsOf(rooms: Record<string, InspectionRoom>): DefectRow[] {
  return sortedRooms(rooms)
    .flatMap((room) => sortedItems(room).filter((i) => i.condition === 'defective').map((item) => ({ room, item })))
    .sort((a, b) => (SEVERITY_RANK[a.item.severity ?? 'minor'] ?? 3) - (SEVERITY_RANK[b.item.severity ?? 'minor'] ?? 3));
}

export function followUpsOf(rooms: Record<string, InspectionRoom>): DefectRow[] {
  return sortedRooms(rooms).flatMap((room) => sortedItems(room).filter((i) => i.followUp).map((item) => ({ room, item })));
}

export interface CompletionCheck {
  /** Problems that stop completion. */
  blocking: string[];
  /** Things the person must explicitly confirm before completing. */
  warnings: string[];
  unchecked: DefectRow[];
  defectsWithoutDetail: DefectRow[];
}

export function completionCheck(inspection: Pick<Inspection, 'rooms' | 'inspectionDate' | 'status'>): CompletionCheck {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (inspection.status !== 'draft') blocking.push('Only a draft inspection can be completed.');
  const rooms = sortedRooms(inspection.rooms);
  if (rooms.length === 0) blocking.push('Add at least one room.');
  const p = inspectionProgress(inspection.rooms);
  if (p.total > 0 && p.checked === 0) blocking.push('Mark at least one item before completing.');
  if (!inspection.inspectionDate) blocking.push('Enter the inspection date.');

  const unchecked = rooms.flatMap((room) => sortedItems(room).filter((i) => i.condition === null).map((item) => ({ room, item })));
  if (unchecked.length > 0)
    warnings.push(`${unchecked.length} item${unchecked.length === 1 ? ' is' : 's are'} still unchecked. They will be reported as "Not inspected", not as good.`);

  const defectsWithoutDetail = defectsOf(inspection.rooms).filter((d) => !d.item.defectDescription.trim() && !d.item.comment.trim());
  if (defectsWithoutDetail.length > 0)
    warnings.push(`${defectsWithoutDetail.length} defect${defectsWithoutDetail.length === 1 ? ' has' : 's have'} no description.`);

  return { blocking, warnings, unchecked, defectsWithoutDetail };
}

/** The content that the completion hash covers: the checklist and the evidence files, not timestamps. */
export function hashableContent(inspection: Pick<Inspection, 'propertyId' | 'type' | 'title' | 'inspectionDate' | 'rooms' | 'generalNotes' | 'parties'>, evidence: Pick<EvidenceRecord, 'ref' | 'sha256' | 'roomId' | 'itemId'>[]) {
  return {
    propertyId: inspection.propertyId,
    type: inspection.type,
    title: inspection.title,
    inspectionDate: inspection.inspectionDate,
    generalNotes: inspection.generalNotes,
    parties: inspection.parties,
    rooms: sortedRooms(inspection.rooms).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      notes: r.notes,
      items: sortedItems(r).map((i) => ({
        id: i.id,
        label: i.label,
        group: i.group,
        condition: i.condition,
        comment: i.comment,
        defectDescription: i.defectDescription,
        severity: i.severity,
        followUp: i.followUp,
      })),
    })),
    evidence: [...evidence]
      .map((e) => ({ ref: e.ref, sha256: e.sha256, roomId: e.roomId, itemId: e.itemId ?? null }))
      .sort((a, b) => (a.ref < b.ref ? -1 : 1)),
  };
}

export function contentHash(...args: Parameters<typeof hashableContent>): Promise<string> {
  return sha256Hex(canonicalJson(hashableContent(...args)));
}

/** Firestore field path for one item field, used for conflict-free partial updates. */
export function itemFieldPath(roomId: string, itemId: string, field: keyof InspectionItem): string {
  return `rooms.${roomId}.items.${itemId}.${field}`;
}

/**
 * Applies a condition and keeps the item consistent: severity and defect text only make sense for defects,
 * so they are kept (not erased) but a defect always gets a severity.
 */
export function withCondition(item: InspectionItem, condition: ItemCondition | null): Partial<InspectionItem> {
  const patch: Partial<InspectionItem> = { condition };
  if (condition === 'defective' && !item.severity) patch.severity = 'minor';
  return patch;
}

export function nextOrder(values: { order: number }[]): number {
  return values.reduce((m, v) => Math.max(m, v.order), -1) + 1;
}
