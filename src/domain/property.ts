import type { PropertyRole, RecordKind } from './roles';

export type PropertyType = 'apartment' | 'house' | 'townhouse' | 'room' | 'commercial' | 'multi_unit' | 'other';

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: 'Apartment',
  house: 'House',
  townhouse: 'Townhouse',
  room: 'Room',
  commercial: 'Commercial unit',
  multi_unit: 'Multi-unit building',
  other: 'Other',
};

export interface Address {
  line1: string;
  line2?: string;
  suburb?: string;
  city: string;
  province?: string;
  postalCode?: string;
  country: string; // ISO alpha-2
}

export interface PropertyMember {
  role: PropertyRole;
  displayName: string;
  email?: string;
  joinedAt?: unknown; // Firestore timestamp
  inviteId?: string; // the accepted invitation, checked by security rules
}

/** `properties/{propertyId}`: details everyone on the property may see. */
export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  address: Address;
  unitNumber?: string;
  buildingName?: string;
  portfolio?: string;
  notes?: string;
  recordKind: RecordKind;
  marketId: string;
  currency: string;
  ownerUid: string;
  memberIds: string[];
  members: Record<string, PropertyMember>;
  coverPhotoPath?: string;
  archived: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** `properties/{propertyId}/private/details`: only the owner's team (finance capability). */
export interface PropertyPrivateDetails {
  ownershipEntity?: string; // legal owner, e.g. a trust or company
  ownershipNotes?: string;
  purchasePrice?: number; // minor units
  purchaseDate?: string; // ISO date
  estimatedMarketValue?: number;
  marketValueDate?: string;
  bondLender?: string;
  bondAccountRef?: string;
  bondBalance?: number;
  bondMonthlyRepayment?: number;
  ratesMonthly?: number;
  leviesMonthly?: number;
  insurer?: string;
  insurancePolicyRef?: string;
  insuranceMonthly?: number;
  insuranceRenewalDate?: string;
  managingAgent?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}

export function formatAddress(a: Address, unitNumber?: string): string {
  return [unitNumber ? `Unit ${unitNumber}` : '', a.line1, a.line2, a.suburb, a.city, a.province, a.postalCode]
    .filter(Boolean)
    .join(', ');
}

export interface PropertyValidation {
  ok: boolean;
  errors: Partial<Record<'name' | 'line1' | 'city' | 'type', string>>;
}

export function validateProperty(input: { name: string; type?: string; address: Partial<Address> }): PropertyValidation {
  const errors: PropertyValidation['errors'] = {};
  if (!input.name.trim()) errors.name = 'Give the property a name you will recognise, such as "Sea Point flat".';
  if (input.name.length > 120) errors.name = 'Keep the name under 120 characters.';
  if (!input.type || !(input.type in PROPERTY_TYPE_LABELS)) errors.type = 'Choose a property type.';
  if (!input.address.line1?.trim()) errors.line1 = 'Enter the street address.';
  if (!input.address.city?.trim()) errors.city = 'Enter the town or city.';
  return { ok: Object.keys(errors).length === 0, errors };
}
