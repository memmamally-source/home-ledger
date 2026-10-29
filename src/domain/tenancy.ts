import { addMonths, compareIsoDate, daysBetween, daysInMonth, parseIsoDate, toIsoDate, type IsoDate, type YearMonth } from './dates';
import { applyPercent } from './money';

export type Escalation =
  | { kind: 'none' }
  /** Compounding increase every `intervalMonths`, first applied on `firstEffective` (defaults to the first anniversary). */
  | { kind: 'percent'; percent: number; intervalMonths: number; firstEffective?: IsoDate }
  /** An explicit schedule of rates, each effective from a date. */
  | { kind: 'steps'; steps: { effectiveFrom: IsoDate; amount: number }[] };

export interface AdditionalCharge {
  label: string;
  amount: number; // minor units per month
}

export interface RentAdjustment {
  period: YearMonth;
  amount: number;
  reason: string;
  createdBy: string;
  createdAt: string; // ISO instant
}

export type UtilityResponsibility = 'tenant' | 'landlord' | 'shared' | 'prepaid_tenant' | 'not_applicable';

/** `properties/{propertyId}/tenancies/{tenancyId}` */
export interface Tenancy {
  id: string;
  propertyId: string;
  tenantName: string;
  tenantEmail?: string;
  landlordName?: string;
  startDate: IsoDate;
  endDate?: IsoDate; // empty for month-to-month
  monthlyRent: number;
  currency: string;
  dueDay: number; // 1–31, clamped to month length
  prorate: boolean; // pro-rata partial first and last months
  escalation: Escalation;
  depositAmount?: number;
  depositPaidDate?: IsoDate;
  depositTerms?: string;
  depositHeldBy?: string;
  utilities: { electricity: UtilityResponsibility; water: UtilityResponsibility; other?: string };
  parking?: string;
  additionalCharges: AdditionalCharge[];
  managingAgent?: string;
  notes?: string;
  adjustments: RentAdjustment[];
  /** Linked accounts that are parties to this tenancy (added when they accept an invitation). */
  partyIds: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RentPeriod {
  period: YearMonth;
  from: IsoDate;
  to: IsoDate;
  dueDate: IsoDate;
  /** The monthly rate in effect for the period, after escalations. */
  rate: number;
  /** What is due for the period: the rate, pro-rated if partial, or a recorded adjustment. */
  amount: number;
  scheduledAmount: number;
  prorated: boolean;
  escalationsApplied: number;
  adjustment?: RentAdjustment;
}

export const MAX_SCHEDULE_MONTHS = 600;

/** The monthly rate effective on `date`, and how many escalations have applied by then. */
export function rateOn(t: Pick<Tenancy, 'monthlyRent' | 'startDate' | 'escalation'>, date: IsoDate): { rate: number; escalations: number } {
  const e = t.escalation;
  if (e.kind === 'none') return { rate: t.monthlyRent, escalations: 0 };
  if (e.kind === 'steps') {
    const steps = [...e.steps].sort((a, b) => compareIsoDate(a.effectiveFrom, b.effectiveFrom));
    let rate = t.monthlyRent;
    let n = 0;
    for (const s of steps) {
      if (compareIsoDate(s.effectiveFrom, date) <= 0) {
        rate = s.amount;
        n++;
      }
    }
    return { rate, escalations: n };
  }
  const interval = Math.max(1, Math.floor(e.intervalMonths));
  const first = e.firstEffective ?? addMonths(t.startDate, interval);
  let rate = t.monthlyRent;
  let n = 0;
  while (n < MAX_SCHEDULE_MONTHS && compareIsoDate(addMonths(first, interval * n), date) <= 0) {
    rate = applyPercent(rate, e.percent);
    n++;
  }
  return { rate, escalations: n };
}

/** The next escalation date strictly after `date`, if the lease has one. */
export function nextEscalation(t: Pick<Tenancy, 'startDate' | 'endDate' | 'escalation'>, date: IsoDate): IsoDate | null {
  const e = t.escalation;
  let candidate: IsoDate | null = null;
  if (e.kind === 'steps') {
    candidate = e.steps.map((s) => s.effectiveFrom).filter((d) => compareIsoDate(d, date) > 0).sort()[0] ?? null;
  } else if (e.kind === 'percent') {
    const interval = Math.max(1, Math.floor(e.intervalMonths));
    const first = e.firstEffective ?? addMonths(t.startDate, interval);
    let k = 0;
    candidate = first;
    while (compareIsoDate(candidate, date) <= 0 && k < MAX_SCHEDULE_MONTHS) {
      k++;
      candidate = addMonths(first, interval * k);
    }
  }
  if (candidate && t.endDate && compareIsoDate(candidate, t.endDate) > 0) return null;
  return candidate;
}

/**
 * The month-by-month rent schedule.
 *
 * Conventions (shown to users on the tenancy screen):
 * - Rent periods are calendar months. A lease starting mid-month has a partial first period, and a lease
 *   ending before month end has a partial last period; with `prorate` these are charged by days.
 * - The rate for a period is the rate in effect on the period's first day, so an escalation applies from
 *   the first period that starts on or after its effective date.
 * - Rent is due on `dueDay` of the period's month (clamped to the month length), but never before the
 *   lease starts.
 * - A recorded adjustment replaces the scheduled amount for that period, keeping its reason.
 */
export function rentSchedule(
  t: Pick<Tenancy, 'monthlyRent' | 'startDate' | 'endDate' | 'escalation' | 'dueDay' | 'prorate' | 'adjustments'>,
  opts: { until?: IsoDate } = {},
): RentPeriod[] {
  const last = t.endDate ?? opts.until;
  if (!last) throw new Error('A month-to-month lease needs an `until` date for its schedule.');
  const end = t.endDate && opts.until && compareIsoDate(opts.until, t.endDate) < 0 ? opts.until : last;
  if (compareIsoDate(end, t.startDate) < 0) return [];

  const periods: RentPeriod[] = [];
  const start = parseIsoDate(t.startDate);
  let y = start.y;
  let m = start.m;
  for (let i = 0; i < MAX_SCHEDULE_MONTHS; i++) {
    const monthStart = toIsoDate(y, m, 1);
    if (compareIsoDate(monthStart, end) > 0 && i > 0) break;
    const dim = daysInMonth(y, m);
    const monthEnd = toIsoDate(y, m, dim);
    const from = i === 0 ? t.startDate : monthStart;
    const to = t.endDate && compareIsoDate(t.endDate, monthEnd) < 0 ? t.endDate : monthEnd;
    if (compareIsoDate(from, end) > 0) break;

    const { rate, escalations } = rateOn(t, from);
    const days = daysBetween(from, to) + 1;
    const partial = days < dim;
    const scheduledAmount = partial && t.prorate ? Math.round((rate * days) / dim) : rate;
    let dueDate = toIsoDate(y, m, Math.min(Math.max(1, t.dueDay), dim));
    if (compareIsoDate(dueDate, t.startDate) < 0) dueDate = t.startDate;
    const period = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
    const adjustment = [...t.adjustments].reverse().find((a) => a.period === period);

    periods.push({
      period,
      from,
      to,
      dueDate,
      rate,
      scheduledAmount,
      amount: adjustment ? adjustment.amount : scheduledAmount,
      prorated: partial && t.prorate,
      escalationsApplied: escalations,
      adjustment,
    });

    if (compareIsoDate(to, end) >= 0) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return periods;
}

export type LeaseStatus = 'upcoming' | 'active' | 'month_to_month' | 'ended';

export function leaseStatus(t: Pick<Tenancy, 'startDate' | 'endDate'>, today: IsoDate): LeaseStatus {
  if (compareIsoDate(today, t.startDate) < 0) return 'upcoming';
  if (!t.endDate) return 'month_to_month';
  return compareIsoDate(today, t.endDate) > 0 ? 'ended' : 'active';
}

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  upcoming: 'Starts soon',
  active: 'Active',
  month_to_month: 'Month to month',
  ended: 'Ended',
};

export function daysUntilExpiry(t: Pick<Tenancy, 'endDate'>, today: IsoDate): number | null {
  return t.endDate ? daysBetween(today, t.endDate) : null;
}

export interface TenancyValidation {
  ok: boolean;
  errors: Partial<Record<'tenantName' | 'startDate' | 'endDate' | 'monthlyRent' | 'dueDay' | 'escalation', string>>;
}

export function validateTenancy(t: Partial<Tenancy>): TenancyValidation {
  const errors: TenancyValidation['errors'] = {};
  if (!t.tenantName?.trim()) errors.tenantName = 'Enter the tenant’s name.';
  if (!t.startDate) errors.startDate = 'Enter the lease start date.';
  if (t.startDate && t.endDate && compareIsoDate(t.endDate, t.startDate) < 0) errors.endDate = 'The lease must end after it starts.';
  if (t.monthlyRent == null || !Number.isSafeInteger(t.monthlyRent) || t.monthlyRent < 0) errors.monthlyRent = 'Enter the monthly rent.';
  if (!t.dueDay || t.dueDay < 1 || t.dueDay > 31) errors.dueDay = 'Rent due day must be between 1 and 31.';
  const e = t.escalation;
  if (e?.kind === 'percent' && (!(e.percent > 0) || e.percent > 100 || !(e.intervalMonths >= 1)))
    errors.escalation = 'Enter an escalation percentage between 0 and 100 and how often it applies.';
  if (e?.kind === 'steps' && e.steps.some((s) => !s.effectiveFrom || !(s.amount >= 0)))
    errors.escalation = 'Each escalation step needs a date and an amount.';
  return { ok: Object.keys(errors).length === 0, errors };
}
