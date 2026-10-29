/**
 * Evidence timing. A photo has several times and they mean different things:
 * - EXIF "taken at" and the file's modified time are written by cameras and phones and can be wrong or edited.
 * - "Added on device" is this device's clock when the photo was attached, also not independently verified.
 * - "Uploaded" is set by the server when the record is created. It proves the file existed by then, and
 *   nothing about when it was taken.
 */

export interface EvidenceTimes {
  exifTakenAt?: Date;
  fileModifiedAt?: Date;
  addedOnDeviceAt: Date;
  uploadedAt?: Date; // server
}

export interface TimeStatement {
  label: string;
  value: Date;
  verified: boolean;
  note: string;
}

export function timeStatements(t: EvidenceTimes): TimeStatement[] {
  const out: TimeStatement[] = [];
  if (t.uploadedAt)
    out.push({ label: 'Uploaded (server time)', value: t.uploadedAt, verified: true, note: 'Recorded by the server. Shows the file existed by this time.' });
  if (t.exifTakenAt)
    out.push({ label: 'Taken (camera metadata)', value: t.exifTakenAt, verified: false, note: 'Reported by the camera. Not independently verified.' });
  if (t.fileModifiedAt)
    out.push({ label: 'File modified (device)', value: t.fileModifiedAt, verified: false, note: 'Reported by the device. Not independently verified.' });
  out.push({ label: 'Added on device', value: t.addedOnDeviceAt, verified: false, note: 'This device’s clock when the photo was attached.' });
  return out;
}

const HOUR = 3_600_000;

/** Flags a claimed capture time that is far from the server upload time, so reviewers know to look closer. */
export function captureGap(t: EvidenceTimes): { hours: number; message: string } | null {
  const claimed = t.exifTakenAt ?? t.fileModifiedAt;
  if (!claimed || !t.uploadedAt) return null;
  const hours = (t.uploadedAt.getTime() - claimed.getTime()) / HOUR;
  if (hours < -0.25) return { hours, message: 'The claimed capture time is after the upload time, so the device clock or metadata is wrong.' };
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return { hours, message: `Uploaded ${days} day${days === 1 ? '' : 's'} after the claimed capture time.` };
  }
  return null;
}

export const ACCEPTED_EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'video/mp4', 'video/quicktime'];
export const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024;

export function evidenceKind(contentType: string): 'photo' | 'video' | null {
  if (!ACCEPTED_EVIDENCE_TYPES.includes(contentType)) return null;
  return contentType.startsWith('video/') ? 'video' : 'photo';
}

export function validateEvidenceFile(file: { type: string; size: number }): string | null {
  if (!evidenceKind(file.type)) return 'Only photos (JPEG, PNG, HEIC, WebP) and videos (MP4, MOV) can be attached.';
  if (file.size > MAX_EVIDENCE_BYTES) return 'This file is larger than 50 MB. Trim the video or choose a smaller file.';
  if (file.size === 0) return 'This file is empty.';
  return null;
}

/** File name kept safe for a storage path; the original name is stored separately, unchanged. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(-80);
  return cleaned || 'file';
}
