import { compareIsoDate, isIsoDate, type IsoDate } from '../dates';
import { isDebitNormal } from './chart';
import type { Account, AccountSubtype, JournalEntry, JournalLine } from './types';

export interface EntryValidation {
  ok: boolean;
  errors: string[];
  totalDebit: number;
  totalCredit: number;
}

export function validateEntry(entry: Pick<JournalEntry, 'date' | 'lines' | 'memo'>, accounts: Map<string, Account>): EntryValidation {
  const errors: string[] = [];
  if (!isIsoDate(entry.date)) errors.push('Enter a valid date.');
  if (entry.lines.length < 2) errors.push('A journal entry needs at least two lines.');
  let totalDebit = 0;
  let totalCredit = 0;
  entry.lines.forEach((l, i) => {
    const n = i + 1;
    if (!accounts.has(l.accountId)) errors.push(`Line ${n}: unknown account.`);
    else if (accounts.get(l.accountId)!.archived) errors.push(`Line ${n}: the account is archived.`);
    for (const v of [l.debit, l.credit]) if (!Number.isSafeInteger(v) || v < 0) errors.push(`Line ${n}: amounts must be whole cents and not negative.`);
    if ((l.debit > 0) === (l.credit > 0)) errors.push(`Line ${n}: enter either a debit or a credit.`);
    totalDebit += l.debit;
    totalCredit += l.credit;
  });
  if (totalDebit !== totalCredit) errors.push(`Debits (${totalDebit}) and credits (${totalCredit}) must be equal.`);
  return { ok: errors.length === 0, errors, totalDebit, totalCredit };
}

/** The entry that cancels another, for corrections. The original stays in the ledger. */
export function reversalOf(entry: JournalEntry, opts: { id: string; date: IsoDate; createdBy: string; reason: string }): JournalEntry {
  return {
    id: opts.id,
    entityId: entry.entityId,
    date: opts.date,
    memo: `Reversal of "${entry.memo}": ${opts.reason}`,
    currency: entry.currency,
    lines: entry.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
    source: { kind: 'reversal', ref: entry.id },
    reversesEntryId: entry.id,
    createdBy: opts.createdBy,
  };
}

export interface LedgerFilter {
  from?: IsoDate; // inclusive
  to?: IsoDate; // inclusive
  propertyIds?: string[]; // managerial view: only lines tagged to these properties
}

function inRange(date: IsoDate, f: LedgerFilter): boolean {
  return (!f.from || compareIsoDate(date, f.from) >= 0) && (!f.to || compareIsoDate(date, f.to) <= 0);
}

function lineMatches(l: JournalLine, f: LedgerFilter): boolean {
  return !f.propertyIds || (l.propertyId != null && f.propertyIds.includes(l.propertyId));
}

/** Net debit-minus-credit per account. */
export function netByAccount(entries: JournalEntry[], f: LedgerFilter = {}): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (!inRange(e.date, f)) continue;
    for (const l of e.lines) {
      if (!lineMatches(l, f)) continue;
      out.set(l.accountId, (out.get(l.accountId) ?? 0) + l.debit - l.credit);
    }
  }
  return out;
}

/** Balance in the account's natural direction (positive asset = debit balance, positive liability = credit balance). */
export function naturalBalance(account: Account, net: number): number {
  return isDebitNormal(account.type) ? net : -net;
}

export interface StatementLine {
  account: Account;
  amount: number;
}

function linesOf(accounts: Account[], net: Map<string, number>, pick: (a: Account) => boolean): StatementLine[] {
  return accounts
    .filter(pick)
    .map((account) => ({ account, amount: naturalBalance(account, net.get(account.id) ?? 0) }))
    .filter((l) => l.amount !== 0);
}

const total = (ls: StatementLine[]) => ls.reduce((s, l) => s + l.amount, 0);
const is = (...subtypes: AccountSubtype[]) => (a: Account) => subtypes.includes(a.subtype);

export interface IncomeStatement {
  rentalRevenue: StatementLine[];
  otherRevenue: StatementLine[];
  operatingExpenses: StatementLine[];
  totalRevenue: number;
  totalOperatingExpenses: number;
  netOperatingIncome: number;
  interestAndNonOperating: StatementLine[];
  netProfit: number;
}

export function incomeStatement(accounts: Account[], entries: JournalEntry[], f: LedgerFilter): IncomeStatement {
  const net = netByAccount(entries, f);
  const rentalRevenue = linesOf(accounts, net, is('rental_income'));
  const otherRevenue = linesOf(accounts, net, is('other_income'));
  const operatingExpenses = linesOf(accounts, net, is('operating_expense'));
  const interestAndNonOperating = linesOf(accounts, net, is('interest_expense', 'non_operating_expense'));
  const totalRevenue = total(rentalRevenue) + total(otherRevenue);
  const totalOperatingExpenses = total(operatingExpenses);
  const netOperatingIncome = totalRevenue - totalOperatingExpenses;
  return {
    rentalRevenue,
    otherRevenue,
    operatingExpenses,
    totalRevenue,
    totalOperatingExpenses,
    netOperatingIncome,
    interestAndNonOperating,
    netProfit: netOperatingIncome - total(interestAndNonOperating),
  };
}

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  /** Profit not yet closed to retained earnings: prior years' and the current year's, shown separately. */
  priorYearsEarnings: number;
  currentPeriodEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  /** Assets − (Liabilities + Equity). Must be zero; it is reported, never plugged. */
  difference: number;
  balanced: boolean;
}

/**
 * Balance sheet at `asOf`, on the full ledger (property filters are not applied: a balance sheet for part
 * of an entity is a managerial summary and is produced separately with its own label).
 */
export function balanceSheet(accounts: Account[], entries: JournalEntry[], asOf: IsoDate, fiscalYearStart: IsoDate): BalanceSheet {
  const net = netByAccount(entries, { to: asOf });
  const assets = linesOf(accounts, net, (a) => a.type === 'asset');
  const liabilities = linesOf(accounts, net, (a) => a.type === 'liability');
  const equity = linesOf(accounts, net, (a) => a.type === 'equity');
  const profit = (f: LedgerFilter) => {
    const n = netByAccount(entries, f);
    return accounts.filter((a) => a.type === 'income' || a.type === 'expense').reduce((s, a) => s - (n.get(a.id) ?? 0), 0);
  };
  const currentPeriodEarnings = compareIsoDate(fiscalYearStart, asOf) <= 0 ? profit({ from: fiscalYearStart, to: asOf }) : 0;
  const priorYearsEarnings = profit({ to: asOf }) - currentPeriodEarnings;
  const totalAssets = total(assets);
  const totalLiabilities = total(liabilities);
  const totalEquity = total(equity) + priorYearsEarnings + currentPeriodEarnings;
  const difference = totalAssets - (totalLiabilities + totalEquity);
  return { assets, liabilities, equity, priorYearsEarnings, currentPeriodEarnings, totalAssets, totalLiabilities, totalEquity, difference, balanced: difference === 0 };
}

export interface CashFlowStatement {
  rentReceived: number;
  otherOperatingReceipts: number;
  operatingPayments: number;
  netOperating: number;
  investing: number;
  financing: number;
  depositsMovement: number;
  netCashMovement: number;
}

/**
 * Direct-method cash flow: classifies each entry's movement in cash and bank accounts by the
 * other side of the entry. An entry touching several categories is split pro rata by line amount.
 */
export function cashFlow(accounts: Account[], entries: JournalEntry[], f: LedgerFilter): CashFlowStatement {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const isCash = (a?: Account) => a?.subtype === 'bank' || a?.subtype === 'cash' || a?.subtype === 'deposit_held';
  const out: CashFlowStatement = { rentReceived: 0, otherOperatingReceipts: 0, operatingPayments: 0, netOperating: 0, investing: 0, financing: 0, depositsMovement: 0, netCashMovement: 0 };
  for (const e of entries) {
    if (!inRange(e.date, f)) continue;
    const cashNet = e.lines.filter((l) => isCash(byId.get(l.accountId))).reduce((s, l) => s + l.debit - l.credit, 0);
    if (cashNet === 0) continue;
    const others = e.lines.filter((l) => !isCash(byId.get(l.accountId)));
    const weight = others.reduce((s, l) => s + l.debit + l.credit, 0);
    let allocated = 0;
    others.forEach((l, i) => {
      const share = i === others.length - 1 ? cashNet - allocated : Math.round((cashNet * (l.debit + l.credit)) / weight);
      allocated += share;
      const s = byId.get(l.accountId)?.subtype;
      if (s === 'rental_income' || s === 'rent_receivable') out.rentReceived += share;
      else if (s === 'other_income' || s === 'other_receivable') out.otherOperatingReceipts += share;
      else if (s === 'investment_property' || s === 'other_asset') out.investing += share;
      else if (s === 'mortgage' || s === 'other_loan' || s === 'owner_contributions' || s === 'owner_withdrawals' || s === 'opening_balance_equity' || s === 'interest_expense') out.financing += share;
      else if (s === 'tenant_deposits') out.depositsMovement += share;
      else out.operatingPayments += share;
    });
  }
  out.netOperating = out.rentReceived + out.otherOperatingReceipts + out.operatingPayments;
  out.netCashMovement = out.netOperating + out.investing + out.financing + out.depositsMovement;
  return out;
}

/** Splits a bond instalment into interest (expense) and principal (reduces the liability). */
export function bondRepaymentLines(p: { bankId: string; mortgageId: string; interestId: string; interest: number; principal: number; propertyId?: string }): JournalLine[] {
  return [
    { accountId: p.interestId, debit: p.interest, credit: 0, propertyId: p.propertyId, memo: 'Bond interest' },
    { accountId: p.mortgageId, debit: p.principal, credit: 0, propertyId: p.propertyId, memo: 'Bond principal' },
    { accountId: p.bankId, debit: 0, credit: p.interest + p.principal, propertyId: p.propertyId },
  ].filter((l) => l.debit > 0 || l.credit > 0);
}
