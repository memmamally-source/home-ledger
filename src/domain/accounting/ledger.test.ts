import { describe, expect, it } from 'vitest';
import { DEFAULT_CHART } from './chart';
import { balanceSheet, bondRepaymentLines, cashFlow, incomeStatement, reversalOf, validateEntry } from './ledger';
import type { JournalEntry, JournalLine } from './types';

const accounts = new Map(DEFAULT_CHART.map((a) => [a.id, a]));
let n = 0;
const entry = (date: string, lines: JournalLine[], memo = 'x'): JournalEntry => ({ id: `e${++n}`, entityId: 'ent', date, memo, currency: 'ZAR', lines, source: { kind: 'manual' }, createdBy: 'u' });
const dr = (accountId: string, amount: number, propertyId?: string): JournalLine => ({ accountId, debit: amount, credit: 0, propertyId });
const cr = (accountId: string, amount: number, propertyId?: string): JournalLine => ({ accountId, debit: 0, credit: amount, propertyId });

// A small, realistic year for one property.
const ledger: JournalEntry[] = [
  entry('2025-03-01', [dr('1500', 150_000_000, 'p1'), cr('2000', 120_000_000, 'p1'), cr('3900', 30_000_000)], 'Opening balances'),
  entry('2025-03-01', [dr('1000', 5_000_000), cr('3000', 5_000_000)], 'Owner contribution'),
  entry('2025-03-01', [dr('1100', 1_200_000, 'p1'), cr('4000', 1_200_000, 'p1')], 'March rent billed'),
  entry('2025-03-03', [dr('1000', 1_000_000, 'p1'), cr('1100', 1_000_000, 'p1')], 'Part payment'),
  entry('2025-03-05', [dr('1020', 2_400_000, 'p1'), cr('2100', 2_400_000, 'p1')], 'Deposit received'),
  entry('2025-03-10', [dr('5050', 150_000, 'p1'), cr('1000', 150_000, 'p1')], 'Tap repair'),
  entry('2025-03-12', [dr('1510', 2_000_000, 'p1'), cr('1000', 2_000_000, 'p1')], 'New kitchen (capital)'),
  entry('2025-03-25', bondRepaymentLines({ bankId: '1000', mortgageId: '2000', interestId: '6000', interest: 1_000_000, principal: 300_000, propertyId: 'p1' }), 'Bond instalment'),
];

describe('validateEntry', () => {
  it('accepts balanced entries', () => ledger.forEach((e) => expect(validateEntry(e, accounts).errors).toEqual([])));
  it('rejects unbalanced, one-sided, fractional and unknown lines', () => {
    expect(validateEntry({ date: '2025-01-01', memo: '', lines: [dr('1000', 100), cr('4000', 90)] }, accounts).errors.join()).toMatch(/must be equal/);
    expect(validateEntry({ date: '2025-01-01', memo: '', lines: [{ accountId: '1000', debit: 10, credit: 10 }, cr('4000', 0)] }, accounts).ok).toBe(false);
    expect(validateEntry({ date: '2025-01-01', memo: '', lines: [dr('1000', 10.5), cr('4000', 10.5)] }, accounts).ok).toBe(false);
    expect(validateEntry({ date: '2025-01-01', memo: '', lines: [dr('9999', 1), cr('4000', 1)] }, accounts).errors.join()).toMatch(/unknown/);
    expect(validateEntry({ date: 'bad', memo: '', lines: [dr('1000', 1)] }, accounts).errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('income statement', () => {
  it('separates NOI from interest; principal and capital work are not expenses', () => {
    const is = incomeStatement(DEFAULT_CHART, ledger, { from: '2025-03-01', to: '2025-03-31' });
    expect(is.totalRevenue).toBe(1_200_000); // billed, accrual basis
    expect(is.totalOperatingExpenses).toBe(150_000); // only the repair
    expect(is.netOperatingIncome).toBe(1_050_000);
    expect(is.interestAndNonOperating.map((l) => l.amount)).toEqual([1_000_000]);
    expect(is.netProfit).toBe(50_000);
  });
  it('filters by property', () => {
    expect(incomeStatement(DEFAULT_CHART, ledger, { propertyIds: ['other'] }).totalRevenue).toBe(0);
  });
});

describe('balance sheet', () => {
  it('reconciles Assets = Liabilities + Equity', () => {
    const bs = balanceSheet(DEFAULT_CHART, ledger, '2025-03-31', '2025-03-01');
    expect(bs.balanced).toBe(true);
    expect(bs.difference).toBe(0);
    expect(bs.currentPeriodEarnings).toBe(50_000);
    const byCode = Object.fromEntries(bs.liabilities.map((l) => [l.account.code, l.amount]));
    expect(byCode['2000']).toBe(119_700_000); // bond reduced by principal only
    expect(byCode['2100']).toBe(2_400_000); // deposit is a liability, not income
    expect(bs.assets.find((l) => l.account.code === '1100')!.amount).toBe(200_000); // arrears
  });
  it('reports an inconsistent ledger instead of plugging it', () => {
    const broken = [...ledger, entry('2025-03-30', [dr('1000', 100)])];
    const bs = balanceSheet(DEFAULT_CHART, broken, '2025-03-31', '2025-03-01');
    expect(bs.balanced).toBe(false);
    expect(bs.difference).toBe(100);
  });
  it('splits prior years from the current year', () => {
    const bs = balanceSheet(DEFAULT_CHART, ledger, '2025-03-31', '2025-03-15');
    expect(bs.priorYearsEarnings + bs.currentPeriodEarnings).toBe(50_000);
    expect(bs.currentPeriodEarnings).toBe(-1_000_000); // only the bond interest falls after 15 March
  });
});

describe('cash flow', () => {
  it('distinguishes rent received from rent billed', () => {
    const cf = cashFlow(DEFAULT_CHART, ledger, { from: '2025-03-01', to: '2025-03-31' });
    expect(cf.rentReceived).toBe(1_000_000);
    expect(cf.operatingPayments).toBe(-150_000);
    expect(cf.investing).toBe(-2_000_000);
    expect(cf.financing).toBe(5_000_000 - 1_300_000);
    expect(cf.depositsMovement).toBe(2_400_000);
    expect(cf.netCashMovement).toBe(1_000_000 - 150_000 - 2_000_000 + 3_700_000 + 2_400_000);
  });
});

describe('corrections', () => {
  it('a reversal cancels the original exactly', () => {
    const original = ledger[5]!;
    const rev = reversalOf(original, { id: 'r1', date: '2025-03-31', createdBy: 'u', reason: 'Posted to the wrong property' });
    expect(validateEntry(rev, accounts).ok).toBe(true);
    const is = incomeStatement(DEFAULT_CHART, [...ledger, rev], {});
    expect(is.totalOperatingExpenses).toBe(0);
    expect(rev.reversesEntryId).toBe(original.id);
  });
});
