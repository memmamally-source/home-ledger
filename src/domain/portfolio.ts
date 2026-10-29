import { addMonths, compareIsoDate, daysBetween, type IsoDate } from './dates';
import type { Property } from './property';
import { leaseStatus, nextEscalation, rateOn, type Tenancy } from './tenancy';

export interface PortfolioSummary {
  properties: number;
  occupied: number;
  vacant: number;
  occupancyPercent: number | null;
  /** Rent due this month under current lease terms, per currency. Billing, not money received. */
  expectedMonthlyRent: Record<string, number>;
  expiring: { property: Property; tenancy: Tenancy; days: number }[];
  escalations: { property: Property; tenancy: Tenancy; date: IsoDate; days: number; newRate: number }[];
  upcomingMoveIns: { property: Property; tenancy: Tenancy; days: number }[];
}

export function currentTenancies(tenancies: Tenancy[], today: IsoDate): Tenancy[] {
  return tenancies.filter((t) => {
    const s = leaseStatus(t, today);
    return s === 'active' || s === 'month_to_month';
  });
}

export function summarisePortfolio(properties: Property[], tenanciesByProperty: Map<string, Tenancy[]>, today: IsoDate, horizonDays = { expiry: 90, escalation: 60 }): PortfolioSummary {
  const live = properties.filter((p) => !p.archived);
  const out: PortfolioSummary = { properties: live.length, occupied: 0, vacant: 0, occupancyPercent: null, expectedMonthlyRent: {}, expiring: [], escalations: [], upcomingMoveIns: [] };
  for (const property of live) {
    const all = tenanciesByProperty.get(property.id) ?? [];
    const current = currentTenancies(all, today);
    if (current.length > 0) out.occupied++;
    else out.vacant++;
    for (const tenancy of current) {
      const { rate } = rateOn(tenancy, today);
      out.expectedMonthlyRent[tenancy.currency] = (out.expectedMonthlyRent[tenancy.currency] ?? 0) + rate;
      if (tenancy.endDate) {
        const days = daysBetween(today, tenancy.endDate);
        if (days >= 0 && days <= horizonDays.expiry) out.expiring.push({ property, tenancy, days });
      }
      const next = nextEscalation(tenancy, today);
      if (next) {
        const days = daysBetween(today, next);
        if (days <= horizonDays.escalation) out.escalations.push({ property, tenancy, date: next, days, newRate: rateOn(tenancy, next).rate });
      }
    }
    for (const tenancy of all) {
      if (leaseStatus(tenancy, today) !== 'upcoming') continue;
      const days = daysBetween(today, tenancy.startDate);
      if (compareIsoDate(tenancy.startDate, addMonths(today, 3)) <= 0) out.upcomingMoveIns.push({ property, tenancy, days });
    }
  }
  out.occupancyPercent = live.length ? Math.round((out.occupied / live.length) * 100) : null;
  out.expiring.sort((a, b) => a.days - b.days);
  out.escalations.sort((a, b) => a.days - b.days);
  out.upcomingMoveIns.sort((a, b) => a.days - b.days);
  return out;
}
