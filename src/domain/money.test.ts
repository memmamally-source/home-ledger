import { describe, expect, it } from 'vitest';
import { applyPercent, formatMoney, parseMoneyInput } from './money';

describe('parseMoneyInput', () => {
  it.each([
    ['12500', 1_250_000],
    ['12 500', 1_250_000],
    ['12,500', 1_250_000],
    ['12,500.50', 1_250_050],
    ['12 500,50', 1_250_050],
    ['R 9 000', 900_000],
    ['0.5', 50],
    ['7,5', 750],
    ['1.234.567,89', 123_456_789],
  ])('%s → %i', (text, minor) => expect(parseMoneyInput(text, 'ZAR')).toBe(minor));

  it('rejects negatives and junk', () => {
    expect(parseMoneyInput('-100', 'ZAR')).toBeNull();
    expect(parseMoneyInput('abc', 'ZAR')).toBeNull();
    expect(parseMoneyInput('', 'ZAR')).toBeNull();
  });
});

describe('applyPercent', () => {
  it('rounds to the nearest cent, half away from zero', () => {
    expect(applyPercent(1_000_000, 8)).toBe(1_080_000);
    expect(applyPercent(1_234_567, 7.5)).toBe(1_327_160); // 13 271.595 25 → 13 271.60
    expect(applyPercent(105, 10)).toBe(116); // 115.5 → 116
  });
  it('refuses fractional cents', () => expect(() => applyPercent(10.5, 1)).toThrow());
});

describe('formatMoney', () => {
  it('formats rand in en-ZA', () => {
    const s = formatMoney(1_250_050, 'ZAR', 'en-ZA');
    expect(s.replace(/\s/g, ' ')).toMatch(/R\s?12\s500,50/);
  });
});
