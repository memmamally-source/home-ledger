import type { Account, AccountSubtype, AccountType } from './types';

const A = (code: string, name: string, type: AccountType, subtype: AccountSubtype): Account => ({ id: code, code, name, type, subtype });

/** A neutral starting chart. Markets can extend it; codes are stable ids. */
export const DEFAULT_CHART: Account[] = [
  A('1000', 'Bank', 'asset', 'bank'),
  A('1010', 'Cash on hand', 'asset', 'cash'),
  A('1020', 'Deposit holding account', 'asset', 'deposit_held'),
  A('1100', 'Rent receivable', 'asset', 'rent_receivable'),
  A('1110', 'Other receivables', 'asset', 'other_receivable'),
  A('1200', 'Prepaid expenses', 'asset', 'prepaid'),
  A('1500', 'Investment property (at cost)', 'asset', 'investment_property'),
  A('1510', 'Capital improvements', 'asset', 'investment_property'),
  A('1900', 'Other assets', 'asset', 'other_asset'),

  A('2000', 'Mortgage / bond', 'liability', 'mortgage'),
  A('2100', 'Tenant deposits held', 'liability', 'tenant_deposits'),
  A('2200', 'Accounts payable', 'liability', 'accounts_payable'),
  A('2300', 'Accrued expenses', 'liability', 'accrued'),
  A('2400', 'Other loans', 'liability', 'other_loan'),

  A('3000', 'Owner contributions', 'equity', 'owner_contributions'),
  A('3100', 'Owner withdrawals', 'equity', 'owner_withdrawals'),
  A('3200', 'Retained earnings', 'equity', 'retained_earnings'),
  A('3900', 'Opening balance equity', 'equity', 'opening_balance_equity'),

  A('4000', 'Rental income', 'income', 'rental_income'),
  A('4100', 'Parking income', 'income', 'other_income'),
  A('4110', 'Storage income', 'income', 'other_income'),
  A('4200', 'Utility recoveries', 'income', 'other_income'),
  A('4300', 'Late fees', 'income', 'other_income'),
  A('4900', 'Other property income', 'income', 'other_income'),

  A('5000', 'Municipal rates', 'expense', 'operating_expense'),
  A('5010', 'Levies', 'expense', 'operating_expense'),
  A('5020', 'Property management fees', 'expense', 'operating_expense'),
  A('5030', 'Insurance', 'expense', 'operating_expense'),
  A('5040', 'Cleaning', 'expense', 'operating_expense'),
  A('5050', 'Repairs and maintenance', 'expense', 'operating_expense'),
  A('5060', 'Security', 'expense', 'operating_expense'),
  A('5070', 'Electricity', 'expense', 'operating_expense'),
  A('5080', 'Water', 'expense', 'operating_expense'),
  A('5090', 'Refuse collection', 'expense', 'operating_expense'),
  A('5100', 'Garden maintenance', 'expense', 'operating_expense'),
  A('5110', 'Professional fees', 'expense', 'operating_expense'),
  A('5900', 'Other operating expenses', 'expense', 'operating_expense'),
  A('6000', 'Mortgage interest', 'expense', 'interest_expense'),
  A('6100', 'Other non-operating expenses', 'expense', 'non_operating_expense'),
];

/** Debit-normal accounts increase with debits. */
export function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}
