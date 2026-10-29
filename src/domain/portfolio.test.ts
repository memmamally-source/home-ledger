import { describe, expect, it } from 'vitest';
import { summarisePortfolio } from './portfolio';
import type { Property } from './property';
import type { Tenancy } from './tenancy';

const prop = (id: string, archived = false) => ({ id, name: id, archived }) as Property;
const ten = (id: string, extra: Partial<Tenancy>): Tenancy =>
  ({ id, propertyId: 'x', tenantName: id, startDate: '2025-01-01', endDate: '2025-12-31', monthlyRent: 1_000_000, currency: 'ZAR', dueDay: 1, prorate: true, escalation: { kind: 'none' }, adjustments: [], additionalCharges: [], partyIds: [], utilities: { electricity: 'tenant', water: 'tenant' }, createdBy: 'u', ...extra }) as Tenancy;

describe('summarisePortfolio', () => {
  it('counts occupancy, expected rent, expiries and escalations', () => {
    const props = [prop('a'), prop('b'), prop('c'), prop('old', true)];
    const map = new Map([
      ['a', [ten('t1', { endDate: '2025-11-30', escalation: { kind: 'percent', percent: 10, intervalMonths: 6 } })]],
      ['b', [ten('t2', { startDate: '2025-10-15', endDate: '2026-10-14' })]],
      ['c', [ten('t3', { startDate: '2024-01-01', endDate: '2024-12-31' })]],
    ]);
    const s = summarisePortfolio(props, map, '2025-10-01');
    expect(s.properties).toBe(3);
    expect(s.occupied).toBe(1);
    expect(s.vacant).toBe(2);
    expect(s.occupancyPercent).toBe(33);
    expect(s.expectedMonthlyRent).toEqual({ ZAR: 1_100_000 }); // escalated on 2025-07-01
    expect(s.expiring.map((e) => [e.tenancy.id, e.days])).toEqual([['t1', 60]]);
    expect(s.escalations).toEqual([]); // the next one (2026-01-01) is after the lease ends
    expect(s.upcomingMoveIns.map((m) => m.tenancy.id)).toEqual(['t2']);
  });

  it('reports no occupancy for an empty portfolio', () => {
    expect(summarisePortfolio([], new Map(), '2025-01-01').occupancyPercent).toBeNull();
  });
});
