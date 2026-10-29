/**
 * Market (jurisdiction) settings. Nothing country-specific should be hardcoded elsewhere:
 * add a market here and reference it through the user's or property's `marketId`.
 */
export interface Market {
  id: string;
  country: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
  locale: string; // BCP 47, used for number and date formatting
  timeZone: string; // IANA
  units: 'metric' | 'imperial';
  /** Inspection template set to start new inspections from. */
  inspectionTemplateSet: string;
  /** Labels for regional terminology. */
  terms: { province: string; postalCode: string; levies: string; rates: string; bond: string };
}

export const MARKETS: Record<string, Market> = {
  ZA: {
    id: 'ZA',
    country: 'ZA',
    name: 'South Africa',
    currency: 'ZAR',
    locale: 'en-ZA',
    timeZone: 'Africa/Johannesburg',
    units: 'metric',
    inspectionTemplateSet: 'standard-v1',
    terms: { province: 'Province', postalCode: 'Postal code', levies: 'Levies', rates: 'Rates and taxes', bond: 'Bond' },
  },
  GB: {
    id: 'GB',
    country: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    locale: 'en-GB',
    timeZone: 'Europe/London',
    units: 'metric',
    inspectionTemplateSet: 'standard-v1',
    terms: { province: 'County', postalCode: 'Postcode', levies: 'Service charge', rates: 'Council tax', bond: 'Mortgage' },
  },
  US: {
    id: 'US',
    country: 'US',
    name: 'United States',
    currency: 'USD',
    locale: 'en-US',
    timeZone: 'America/New_York',
    units: 'imperial',
    inspectionTemplateSet: 'standard-v1',
    terms: { province: 'State', postalCode: 'ZIP code', levies: 'HOA fees', rates: 'Property tax', bond: 'Mortgage' },
  },
};

export const DEFAULT_MARKET_ID = 'ZA';

export function getMarket(id: string | undefined | null): Market {
  return (id && MARKETS[id]) || MARKETS[DEFAULT_MARKET_ID]!;
}
