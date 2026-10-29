import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, isIsoDate, todayIn } from './dates';

describe('dates', () => {
  it('validates ISO dates including leap years', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('2025-13-01')).toBe(false);
  });
  it('adds months clamping to month end', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-11-15', 3)).toBe('2026-02-15');
    expect(addMonths('2025-03-10', -3)).toBe('2024-12-10');
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });
  it('counts days', () => expect(daysBetween('2025-01-01', '2026-01-01')).toBe(365));
  it('gets today in a time zone', () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Johannesburg (UTC+2)
    expect(todayIn('Africa/Johannesburg', new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
  });
});
