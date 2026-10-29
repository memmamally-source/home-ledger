/** Money is always held as an integer number of minor units (cents) plus an ISO currency code. */
export interface Money {
  amount: number; // minor units, integer
  currency: string;
}

const FRACTION_DIGITS: Record<string, number> = { JPY: 0, KRW: 0 };

export function minorUnitDigits(currency: string): number {
  return FRACTION_DIGITS[currency] ?? 2;
}

export function assertMinor(amount: number): void {
  if (!Number.isSafeInteger(amount)) throw new Error(`Amount must be an integer number of minor units, got ${amount}`);
}

export function formatMoney(amount: number, currency: string, locale = 'en-ZA'): string {
  const digits = minorUnitDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount / 10 ** digits);
}

/**
 * Parses what a person types ("12 500", "12,500.50", "12 500,50", "R 9 000") into minor units.
 * Returns null when the text is not a valid non-negative amount.
 */
export function parseMoneyInput(text: string, currency: string): number | null {
  const digits = minorUnitDigits(currency);
  let s = text.replace(/[^\d.,-]/g, '');
  if (!s || s.includes('-')) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const sepIndex = Math.max(lastDot, lastComma);
  let intPart = s;
  let fracPart = '';
  if (sepIndex >= 0) {
    const tail = s.slice(sepIndex + 1);
    // A separator followed by more digits than the currency's minor units is a thousands separator ("12,500").
    const isDecimal = tail.length > 0 && tail.length <= digits;
    if (isDecimal) {
      intPart = s.slice(0, sepIndex);
      fracPart = tail;
    }
  }
  intPart = intPart.replace(/[.,]/g, '');
  s = intPart || '0';
  if (!/^\d+$/.test(s) || !/^\d*$/.test(fracPart)) return null;
  const minor = Number(s) * 10 ** digits + Number((fracPart + '0'.repeat(digits)).slice(0, digits) || '0');
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Applies a percentage to an amount, rounding half away from zero to the nearest minor unit. */
export function applyPercent(amount: number, percent: number): number {
  assertMinor(amount);
  const raw = (amount * (100 + percent)) / 100;
  const cleaned = Math.round(raw * 1e6) / 1e6; // drop floating-point noise before rounding
  return Math.sign(cleaned) * Math.round(Math.abs(cleaned));
}

export function sum(amounts: number[]): number {
  return amounts.reduce((a, b) => a + b, 0);
}
