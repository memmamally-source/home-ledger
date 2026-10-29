import { formatInstant, formatIsoDate, type IsoDate } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import type { Market } from '@/config/markets';
import { toDate } from './live';

export const fmtMoney = (amount: number, currency: string, market: Market) => formatMoney(amount, currency, market.locale);
export const fmtDate = (d: IsoDate | undefined, market: Market) => (d ? formatIsoDate(d, market.locale) : '—');
export const fmtInstant = (v: unknown, market: Market) => {
  const d = toDate(v);
  return d ? formatInstant(d, market.locale, market.timeZone) : 'Waiting for server';
};
export const fmtDays = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : days < 0 ? `${-days} days ago` : `in ${days} days`);

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/**
 * A claimed capture time. Camera EXIF times without a zone are shown exactly as the camera recorded them,
 * labelled as camera clock, rather than being converted as if they were UTC.
 */
export function fmtClaimed(iso: string | undefined, market: Market): string {
  if (!iso) return 'not available';
  const naive = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(iso);
  if (!naive) return fmtInstant(iso, market);
  const [, y, mo, d, h, mi] = naive;
  const date = new Intl.DateTimeFormat(market.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+y!, +mo! - 1, +d!)));
  return `${date}, ${h}:${mi} (camera clock, time zone unknown)`;
}
