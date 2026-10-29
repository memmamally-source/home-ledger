/**
 * Roles are per property record, never global. The same person can own one property, rent another
 * and inspect a third. These capabilities mirror `firebase/firestore.rules`; keep the two in step.
 */
export type PropertyRole =
  | 'owner'
  | 'co_owner'
  | 'manager'
  | 'agent'
  | 'landlord'
  | 'tenant'
  | 'co_tenant'
  | 'contractor'
  | 'inspector';

/** Whose side of the tenancy the record was created from. */
export type RecordKind = 'landlord' | 'tenant';

export const ROLE_LABELS: Record<PropertyRole, string> = {
  owner: 'Owner',
  co_owner: 'Co-owner',
  manager: 'Property manager',
  agent: 'Managing agent',
  landlord: 'Landlord',
  tenant: 'Tenant',
  co_tenant: 'Co-tenant',
  contractor: 'Contractor',
  inspector: 'Inspector',
};

export const ROLE_DESCRIPTIONS: Record<PropertyRole, string> = {
  owner: 'Full control, including finances and people.',
  co_owner: 'Full control of the property and its finances.',
  manager: 'Runs the property day to day, including finances.',
  agent: 'Runs the property day to day, including finances.',
  landlord: 'Sees what is shared with them and can sign inspections. No access to your private records.',
  tenant: 'Sees the property, their own tenancy and shared inspections. Can run their own inspections.',
  co_tenant: 'Same access as the tenant.',
  contractor: 'Sees basic property details only (assigned repairs arrive in a later phase).',
  inspector: 'Can carry out inspections. No access to finances.',
};

/** Roles that sit on the record owner's team and run the property. */
export const TEAM_ROLES: readonly PropertyRole[] = ['owner', 'co_owner', 'manager', 'agent'];

/** Roles that may be granted through an invitation (owner is never invited). */
export const INVITABLE_ROLES: Record<RecordKind, readonly PropertyRole[]> = {
  landlord: ['co_owner', 'manager', 'agent', 'tenant', 'co_tenant', 'inspector', 'contractor'],
  tenant: ['landlord', 'agent', 'co_tenant'],
};

export interface Capabilities {
  view: boolean;
  manage: boolean; // edit property details, tenancies, invite people
  finance: boolean; // private ownership and financial details
  inspect: boolean; // start inspections
  delete: boolean; // archive the property record
}

export function capabilitiesFor(role: PropertyRole | undefined, isRecordOwner: boolean): Capabilities {
  if (isRecordOwner) return { view: true, manage: true, finance: true, inspect: true, delete: true };
  if (!role) return { view: false, manage: false, finance: false, inspect: false, delete: false };
  const team = TEAM_ROLES.includes(role);
  return {
    view: true,
    manage: team,
    finance: team,
    inspect: role !== 'contractor',
    delete: false,
  };
}
