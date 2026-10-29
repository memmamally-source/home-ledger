import { describe, expect, it } from 'vitest';
import { leaseStatus, nextEscalation, rateOn, rentSchedule, validateTenancy, type Tenancy } from './tenancy';

const base: Pick<Tenancy, 'monthlyRent' | 'startDate' | 'endDate' | 'escalation' | 'dueDay' | 'prorate' | 'adjustments'> = {
  monthlyRent: 1_000_000,
  startDate: '2025-01-01',
  endDate: '2026-12-31',
  escalation: { kind: 'percent', percent: 8, intervalMonths: 12 },
  dueDay: 1,
  prorate: true,
  adjustments: [],
};

describe('rateOn', () => {
  it('compounds annual escalations from the anniversary', () => {
    expect(rateOn(base, '2025-12-31').rate).toBe(1_000_000);
    expect(rateOn(base, '2026-01-01')).toEqual({ rate: 1_080_000, escalations: 1 });
    expect(rateOn(base, '2027-01-01')).toEqual({ rate: 1_166_400, escalations: 2 });
  });
  it('supports an explicit first escalation date', () => {
    const t = { ...base, escalation: { kind: 'percent' as const, percent: 10, intervalMonths: 12, firstEffective: '2025-07-01' } };
    expect(rateOn(t, '2025-06-30').rate).toBe(1_000_000);
    expect(rateOn(t, '2025-07-01').rate).toBe(1_100_000);
    expect(rateOn(t, '2026-07-01').rate).toBe(1_210_000);
  });
  it('supports stepped schedules', () => {
    const t = { ...base, escalation: { kind: 'steps' as const, steps: [{ effectiveFrom: '2025-06-01', amount: 1_050_000 }, { effectiveFrom: '2025-03-01', amount: 1_020_000 }] } };
    expect(rateOn(t, '2025-02-01').rate).toBe(1_000_000);
    expect(rateOn(t, '2025-03-15').rate).toBe(1_020_000);
    expect(rateOn(t, '2025-07-01').rate).toBe(1_050_000);
  });
});

describe('rentSchedule', () => {
  it('produces one period per month with the escalation in month 13', () => {
    const s = rentSchedule(base);
    expect(s).toHaveLength(24);
    expect(s[0]).toMatchObject({ period: '2025-01', amount: 1_000_000, dueDate: '2025-01-01', prorated: false });
    expect(s[11]!.amount).toBe(1_000_000);
    expect(s[12]).toMatchObject({ period: '2026-01', amount: 1_080_000, escalationsApplied: 1 });
  });

  it('pro-rates a mid-month start and end by days', () => {
    const s = rentSchedule({ ...base, startDate: '2025-01-15', endDate: '2025-03-10', escalation: { kind: 'none' } });
    expect(s.map((p) => [p.period, p.from, p.to, p.amount])).toEqual([
      ['2025-01', '2025-01-15', '2025-01-31', Math.round((1_000_000 * 17) / 31)],
      ['2025-02', '2025-02-01', '2025-02-28', 1_000_000],
      ['2025-03', '2025-03-01', '2025-03-10', Math.round((1_000_000 * 10) / 31)],
    ]);
    // never due before the lease starts
    expect(s[0]!.dueDate).toBe('2025-01-15');
  });

  it('charges full months when pro-rating is off', () => {
    const s = rentSchedule({ ...base, startDate: '2025-01-15', endDate: '2025-02-28', prorate: false, escalation: { kind: 'none' } });
    expect(s.map((p) => p.amount)).toEqual([1_000_000, 1_000_000]);
  });

  it('applies an escalation from the first period starting on or after its date', () => {
    const s = rentSchedule({ ...base, startDate: '2025-01-15', endDate: '2026-03-31', escalation: { kind: 'percent', percent: 10, intervalMonths: 12 } });
    // anniversary 2026-01-15: the January 2026 period starts 2026-01-01, so the increase applies from February
    expect(s.find((p) => p.period === '2026-01')!.rate).toBe(1_000_000);
    expect(s.find((p) => p.period === '2026-02')!.rate).toBe(1_100_000);
  });

  it('clamps the due day to short months', () => {
    const s = rentSchedule({ ...base, dueDay: 31, endDate: '2025-03-31', escalation: { kind: 'none' } });
    expect(s.map((p) => p.dueDate)).toEqual(['2025-01-31', '2025-02-28', '2025-03-31']);
  });

  it('uses the latest recorded adjustment and keeps the scheduled amount', () => {
    const s = rentSchedule({
      ...base,
      endDate: '2025-02-28',
      adjustments: [
        { period: '2025-02', amount: 500_000, reason: 'Agreed discount for repairs', createdBy: 'u1', createdAt: '2025-01-20T10:00:00Z' },
        { period: '2025-02', amount: 600_000, reason: 'Revised discount', createdBy: 'u1', createdAt: '2025-01-21T10:00:00Z' },
      ],
    });
    expect(s[1]).toMatchObject({ amount: 600_000, scheduledAmount: 1_000_000 });
    expect(s[1]!.adjustment!.reason).toBe('Revised discount');
  });

  it('needs an end for month-to-month leases', () => {
    const t = { ...base, endDate: undefined };
    expect(() => rentSchedule(t)).toThrow();
    expect(rentSchedule(t, { until: '2025-03-31' })).toHaveLength(3);
  });
});

describe('nextEscalation and status', () => {
  it('finds the next escalation inside the lease', () => {
    expect(nextEscalation(base, '2025-06-01')).toBe('2026-01-01');
    expect(nextEscalation(base, '2026-01-01')).toBeNull(); // 2027 is after the lease ends
  });
  it('derives lease status', () => {
    expect(leaseStatus(base, '2024-12-31')).toBe('upcoming');
    expect(leaseStatus(base, '2025-05-01')).toBe('active');
    expect(leaseStatus(base, '2027-01-01')).toBe('ended');
    expect(leaseStatus({ startDate: '2025-01-01' }, '2030-01-01')).toBe('month_to_month');
  });
});

describe('validateTenancy', () => {
  it('reports missing and inconsistent fields', () => {
    const v = validateTenancy({ tenantName: '', startDate: '2025-02-01', endDate: '2025-01-01', monthlyRent: -1, dueDay: 0 });
    expect(Object.keys(v.errors).sort()).toEqual(['dueDay', 'endDate', 'monthlyRent', 'tenantName']);
  });
});
