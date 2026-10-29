import { describe, expect, it } from 'vitest';
import { buildRooms, completionCheck, contentHash, createRoom, defectsOf, groupedItems, inspectionProgress, sortedItems, sortedRooms, withCondition } from './logic';
import { DEFAULT_ROOMS, ROOM_TYPES, getTemplateSet } from './templates';
import type { InspectionRoom } from './types';

describe('templates', () => {
  it('every room type has a non-empty checklist without duplicate labels', () => {
    for (const type of ROOM_TYPES) {
      const labels = getTemplateSet('standard-v1')[type].groups.flatMap((g) => g.items);
      expect(labels.length).toBeGreaterThan(3);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
  it('the bathroom checklist covers the required fittings', () => {
    const labels = getTemplateSet('standard-v1').bathroom.groups.flatMap((g) => g.items);
    for (const l of ['Toilet flush', 'Toilet seat', 'Basin', 'Taps', 'Shower', 'Bath', 'Drainage', 'Visible leaks', 'Tiles', 'Grouting', 'Mirrors', 'Cabinet hinges', 'Extractor fan', 'Ceiling', 'Mould or water damage'])
      expect(labels).toContain(l);
  });
});

describe('buildRooms', () => {
  it('numbers repeated room types and keeps order', () => {
    const rooms = sortedRooms(buildRooms(DEFAULT_ROOMS.house, 'standard-v1'));
    expect(rooms.map((r) => r.name)).toContain('Bedroom 1');
    expect(rooms.map((r) => r.name)).toContain('Bedroom 2');
    expect(rooms[0]!.name).toBe('Entrance');
  });
  it('starts every item unchecked', () => {
    const rooms = buildRooms(['kitchen'], 'standard-v1');
    const items = Object.values(rooms).flatMap((r) => Object.values(r.items));
    expect(items.every((i) => i.condition === null)).toBe(true);
    expect(inspectionProgress(rooms)).toMatchObject({ checked: 0, good: 0, percent: 0 });
  });
});

function roomWith(conditions: (string | null)[]): InspectionRoom {
  const room = createRoom({ type: 'other', order: 0, templateSet: 'standard-v1' });
  sortedItems(room).forEach((item, i) => {
    item.condition = (i < conditions.length ? conditions[i] : null) as never;
  });
  return room;
}

describe('progress and completion', () => {
  it('counts each condition separately and never counts unchecked as good', () => {
    const room = roomWith(['good', 'defective', 'not_tested', 'na']);
    const p = inspectionProgress({ [room.id]: room });
    expect(p).toMatchObject({ good: 1, defective: 1, notTested: 1, na: 1, checked: 4 });
    expect(p.unchecked).toBe(p.total - 4);
  });

  it('blocks completion when nothing was checked, and warns about unchecked items and undescribed defects', () => {
    const empty = roomWith([]);
    expect(completionCheck({ rooms: { [empty.id]: empty }, inspectionDate: '2025-01-01', status: 'draft' }).blocking).toContain('Mark at least one item before completing.');

    const room = roomWith(['good', 'defective']);
    const c = completionCheck({ rooms: { [room.id]: room }, inspectionDate: '2025-01-01', status: 'draft' });
    expect(c.blocking).toEqual([]);
    expect(c.unchecked.length).toBeGreaterThan(0);
    expect(c.warnings[0]).toMatch(/Not inspected/);
    expect(c.defectsWithoutDetail).toHaveLength(1);
  });

  it('refuses to complete a completed inspection', () => {
    const room = roomWith(['good']);
    expect(completionCheck({ rooms: { [room.id]: room }, inspectionDate: '2025-01-01', status: 'completed' }).blocking.length).toBe(1);
  });

  it('gives a defect a default severity without touching other conditions', () => {
    const room = roomWith([]);
    const item = sortedItems(room)[0]!;
    expect(withCondition(item, 'defective')).toEqual({ condition: 'defective', severity: 'minor' });
    expect(withCondition(item, 'good')).toEqual({ condition: 'good' });
  });

  it('lists defects by severity', () => {
    const room = roomWith(['defective', 'defective']);
    const [a, b] = sortedItems(room);
    a!.severity = 'minor';
    b!.severity = 'urgent';
    expect(defectsOf({ [room.id]: room }).map((d) => d.item.id)).toEqual([b!.id, a!.id]);
  });

  it('groups items in template order', () => {
    const groups = groupedItems(createRoom({ type: 'kitchen', order: 0, templateSet: 'standard-v1' }));
    expect(groups[0]!.group).toBe('kitchen');
    expect(groups.map((g) => g.group)).toEqual(['kitchen', 'doors', 'windows', 'walls', 'floor', 'electrical']);
  });
});

describe('contentHash', () => {
  const base = () => {
    const room = roomWith(['good', 'defective']);
    return { propertyId: 'p1', type: 'ingoing' as const, title: 'Move-in', inspectionDate: '2025-01-01', generalNotes: '', parties: {}, rooms: { [room.id]: room } };
  };

  it('is stable regardless of key order and timestamps', async () => {
    const insp = base();
    const ev = [{ ref: 'EV-B', sha256: 'b', roomId: 'r', itemId: undefined }, { ref: 'EV-A', sha256: 'a', roomId: 'r', itemId: 'i' }];
    const h1 = await contentHash(insp, ev);
    const room = Object.values(insp.rooms)[0]!;
    Object.values(room.items)[0]!.updatedAt = '2030-01-01T00:00:00Z';
    const h2 = await contentHash(insp, [...ev].reverse());
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h2).toBe(h1);
  });

  it('changes when a finding or evidence changes', async () => {
    const insp = base();
    const h1 = await contentHash(insp, []);
    Object.values(Object.values(insp.rooms)[0]!.items)[0]!.comment = 'Scratch on door';
    expect(await contentHash(insp, [])).not.toBe(h1);
    expect(await contentHash(insp, [{ ref: 'EV-1', sha256: 'x', roomId: 'r' }])).not.toBe(await contentHash(insp, []));
  });
});
