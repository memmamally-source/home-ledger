import type { IsoDate } from '../dates';
import type { PropertyRole } from '../roles';

export type InspectionType = 'ingoing' | 'routine' | 'maintenance' | 'outgoing' | 'custom';

export const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  ingoing: 'Ingoing (move-in)',
  routine: 'Routine',
  maintenance: 'Maintenance',
  outgoing: 'Outgoing (move-out)',
  custom: 'Custom',
};

export type RoomType =
  | 'entrance'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bedroom'
  | 'bathroom'
  | 'toilet'
  | 'hallway'
  | 'laundry'
  | 'balcony'
  | 'patio'
  | 'garage'
  | 'garden'
  | 'storage'
  | 'general'
  | 'other';

/** `null` means the item has not been checked. It is never treated as good. */
export type ItemCondition = 'good' | 'defective' | 'not_tested' | 'na';

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  good: 'Good',
  defective: 'Defective',
  not_tested: 'Not tested',
  na: 'N/A',
};

export type Severity = 'minor' | 'moderate' | 'major' | 'urgent';

export const SEVERITY_LABELS: Record<Severity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  major: 'Major',
  urgent: 'Urgent / safety',
};

export interface InspectionItem {
  id: string;
  label: string;
  group: string;
  order: number;
  condition: ItemCondition | null;
  comment: string;
  defectDescription: string;
  severity: Severity | null;
  followUp: boolean;
  custom: boolean;
  updatedAt?: string; // ISO instant from the device clock, for display only
  updatedBy?: string;
}

export interface InspectionRoom {
  id: string;
  name: string;
  type: RoomType;
  order: number;
  notes: string;
  custom: boolean;
  items: Record<string, InspectionItem>;
}

export type InspectionStatus = 'draft' | 'completed' | 'void';

/** `properties/{propertyId}/inspections/{inspectionId}` */
export interface Inspection {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  tenancyId?: string;
  type: InspectionType;
  title: string;
  inspectionDate: IsoDate;
  status: InspectionStatus;
  templateSet: string;
  rooms: Record<string, InspectionRoom>;
  generalNotes: string;
  parties: { tenantName?: string; landlordName?: string; inspectorName?: string; othersPresent?: string };
  /** Accounts that can read this inspection, whatever their membership later becomes. */
  participantIds: string[];
  /** Accounts that can edit the draft. */
  editorIds: string[];
  /** When true, the property owner's team can see it. Tenant-created inspections start private. */
  teamVisible: boolean;
  createdBy: string;
  createdByName: string;
  createdByRole: PropertyRole;
  /** Whether the author was on the owner's team; the team may then edit the draft. */
  createdByTeam: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown; // server time
  completedBy?: string;
  contentHash?: string;
  voidReason?: string;
}

export type Agreement = 'agree' | 'disagree' | 'partial';

/** `.../inspections/{id}/signatures/{uid}`: written once by the signer, never edited. */
export interface InspectionSignature {
  uid: string;
  name: string;
  role: PropertyRole;
  /** Receipt of the report, which is separate from agreeing with it. */
  acknowledgedReceipt: boolean;
  agreement: Agreement;
  comment: string;
  disputedItemIds: string[];
  signatureImage: string; // PNG data URL
  contentHash: string; // the report content the signer saw
  signedAt?: unknown; // server time
}

/** `.../inspections/{id}/evidence/{evidenceId}`: one photo or video, never overwritten. */
export interface EvidenceRecord {
  id: string;
  ref: string; // human-readable evidence identifier
  roomId: string;
  itemId?: string;
  kind: 'photo' | 'video';
  storagePath: string;
  previewPath?: string;
  originalFilename: string;
  contentType: string;
  size: number;
  sha256: string; // computed on the device from the original file before upload
  /** Times reported by the file or device. Not proof of when the photo was taken. */
  claimedCapture: { exifTakenAt?: string; fileModifiedAt?: string; addedOnDeviceAt: string };
  metadata: { width?: number; height?: number; make?: string; model?: string; gps?: boolean };
  /** True when added after the inspection was completed. */
  addendum: boolean;
  caption: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt?: unknown; // server time, enforced by security rules
}
