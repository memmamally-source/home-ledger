/**
 * Audit events live at `properties/{propertyId}/audit/{eventId}`. They are append-only (security rules
 * forbid updates and deletes) and their time is the server's. The `kind` separates an original
 * submission from later additions, corrections, reviews, acknowledgements and (dis)agreements.
 */
export type AuditKind = 'create' | 'addition' | 'edit' | 'correction' | 'review' | 'acknowledgement' | 'agreement' | 'disagreement' | 'access' | 'void';

export type AuditAction =
  | 'property.created'
  | 'property.updated'
  | 'property.private_updated'
  | 'property.archived'
  | 'tenancy.created'
  | 'tenancy.updated'
  | 'invitation.created'
  | 'invitation.revoked'
  | 'invitation.accepted'
  | 'member.removed'
  | 'member.left'
  | 'inspection.created'
  | 'inspection.completed'
  | 'inspection.shared'
  | 'inspection.voided'
  | 'inspection.signed'
  | 'evidence.uploaded'
  | 'report.generated';

export interface AuditEvent {
  id: string;
  action: AuditAction;
  kind: AuditKind;
  actorUid: string;
  actorName: string;
  at?: unknown; // server time
  target: { type: 'property' | 'tenancy' | 'inspection' | 'evidence' | 'invitation' | 'member'; id: string };
  summary: string;
  details?: Record<string, string | number | boolean | null>;
}

/** Deterministic ids for events the security rules require alongside an action. */
export const requiredAuditId = {
  inspectionCompleted: (inspectionId: string) => `complete_${inspectionId}`,
  inspectionSigned: (inspectionId: string, uid: string) => `sign_${inspectionId}_${uid}`,
};

export const AUDIT_KIND_LABELS: Record<AuditKind, string> = {
  create: 'Original submission',
  addition: 'Later addition',
  edit: 'Edit',
  correction: 'Correction',
  review: 'Review',
  acknowledgement: 'Acknowledgement',
  agreement: 'Agreement',
  disagreement: 'Disagreement',
  access: 'Access change',
  void: 'Voided',
};
