import type { IsoDate } from '../dates';

/**
 * Accounting data model (Phase 1 design, Phase 3 interface).
 *
 * Firestore layout:
 *   entities/{entityId}                    legal or managerial owner (person, company, trust, partnership)
 *   entities/{entityId}/accounts/{id}      chart of accounts
 *   entities/{entityId}/journal/{id}       posted journal entries, immutable once posted
 *   entities/{entityId}/audit/{id}         append-only audit events
 *
 * Posted entries are never edited or deleted. A correction is a reversal entry plus a new entry, both
 * linked to the original, so the history is always visible.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export type AccountSubtype =
  // assets
  | 'bank'
  | 'cash'
  | 'rent_receivable'
  | 'other_receivable'
  | 'prepaid'
  | 'investment_property'
  | 'deposit_held' // trust or deposit bank account holding tenant deposits
  | 'other_asset'
  // liabilities
  | 'mortgage'
  | 'tenant_deposits'
  | 'accounts_payable'
  | 'accrued'
  | 'other_loan'
  // equity
  | 'owner_contributions'
  | 'owner_withdrawals'
  | 'retained_earnings'
  | 'opening_balance_equity'
  // income
  | 'rental_income'
  | 'other_income'
  // expenses
  | 'operating_expense'
  | 'interest_expense'
  | 'non_operating_expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  propertyId?: string; // e.g. a property's own carrying value or bond
  archived?: boolean;
}

export interface JournalLine {
  accountId: string;
  debit: number; // minor units, >= 0
  credit: number; // minor units, >= 0
  propertyId?: string;
  tenancyId?: string;
  memo?: string;
}

export type EntrySource = 'manual' | 'opening_balance' | 'rent_charge' | 'payment' | 'maintenance' | 'import' | 'reversal' | 'correction';

export interface JournalEntry {
  id: string;
  entityId: string;
  date: IsoDate;
  memo: string;
  currency: string;
  lines: JournalLine[];
  source: { kind: EntrySource; ref?: string };
  reversesEntryId?: string;
  correctsEntryId?: string;
  attachmentIds?: string[];
  createdBy: string;
  createdAt?: unknown;
}

export interface LedgerEntity {
  id: string;
  name: string;
  kind: 'individual' | 'company' | 'trust' | 'partnership' | 'other';
  currency: string;
  /** Accounting basis for reports. Cash basis ignores receivables and payables in the income statement. */
  basis: 'accrual' | 'cash';
  fiscalYearStartMonth: number; // 1–12 (South Africa individuals: March = 3)
  ownerUid: string;
  memberIds: string[];
}
