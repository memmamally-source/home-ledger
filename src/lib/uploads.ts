import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getBlob, getMetadata, ref, uploadBytes } from 'firebase/storage';
import { createStore, del, entries, set } from 'idb-keyval';
import { addAudit, clean, type Actor } from '@/data/common';
import { evidenceKind, safeFileName } from '@/domain/evidence';
import { newEvidenceRef, newId } from '@/domain/ids';
import type { EvidenceRecord } from '@/domain/inspection/types';
import { getDb, getStorageInstance } from './firebase';
import { prepareFile } from './media';

/**
 * Evidence upload queue. Photos are saved on the device first (IndexedDB), so an inspection can be done
 * with no signal; each one uploads when there is a connection. The record's "uploaded" time is the
 * server's, set only when the upload really happens.
 */

export interface QueuedUpload {
  id: string;
  ref: string;
  propertyId: string;
  inspectionId: string;
  roomId: string;
  itemId?: string;
  file: Blob;
  preview?: Blob;
  originalFilename: string;
  contentType: string;
  size: number;
  sha256: string;
  claimedCapture: EvidenceRecord['claimedCapture'];
  metadata: EvidenceRecord['metadata'];
  addendum: boolean;
  caption: string;
  actor: Actor;
  state: 'queued' | 'uploading' | 'failed';
  error?: string;
  attempts: number;
}

const store = createStore('homeledger-uploads', 'queue');
const listeners = new Set<() => void>();
let snapshot: QueuedUpload[] = [];
let running = false;

function emit() {
  for (const l of listeners) l();
}

async function refresh() {
  snapshot = (await entries<string, QueuedUpload>(store)).map(([, v]) => v);
  emit();
}

export function subscribeUploads(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getUploadsSnapshot() {
  return snapshot;
}

export async function queueEvidence(file: File, target: { propertyId: string; inspectionId: string; roomId: string; itemId?: string; addendum: boolean; caption?: string }, actor: Actor): Promise<string> {
  const kind = evidenceKind(file.type);
  if (!kind) throw new Error('Unsupported file type');
  const addedOnDeviceAt = new Date().toISOString();
  const prepared = await prepareFile(file);
  const item: QueuedUpload = {
    id: newId(16),
    ref: newEvidenceRef(),
    ...target,
    file,
    preview: prepared.preview,
    originalFilename: file.name || `capture.${file.type.split('/')[1] ?? 'bin'}`,
    contentType: file.type,
    size: file.size,
    sha256: prepared.sha256,
    claimedCapture: clean({ exifTakenAt: prepared.exifTakenAt, fileModifiedAt: prepared.fileModifiedAt, addedOnDeviceAt }),
    metadata: prepared.metadata,
    addendum: target.addendum,
    caption: target.caption ?? '',
    actor,
    state: 'queued',
    attempts: 0,
  };
  await set(item.id, item, store);
  await refresh();
  void processQueue();
  return item.id;
}

async function uploadOnce(path: string, blob: Blob, contentType: string, meta: Record<string, string>) {
  const r = ref(getStorageInstance(), path);
  // A previous attempt may have uploaded the file before failing to write the record.
  const exists = await getMetadata(r).then(
    () => true,
    () => false,
  );
  if (!exists) await uploadBytes(r, blob, { contentType, customMetadata: meta });
}

async function uploadItem(q: QueuedUpload) {
  const base = `properties/${q.propertyId}/inspections/${q.inspectionId}/${q.id}`;
  const storagePath = `${base}/original-${safeFileName(q.originalFilename)}`;
  const meta = { uploadedBy: q.actor.uid, sha256: q.sha256, evidenceRef: q.ref };
  await uploadOnce(storagePath, q.file, q.contentType, meta);
  let previewPath: string | undefined;
  if (q.preview) {
    previewPath = `${base}/preview.jpg`;
    await uploadOnce(previewPath, q.preview, 'image/jpeg', { ...meta, sha256: q.sha256, derivedFrom: 'original' });
  }
  const db = getDb();
  const b = writeBatch(db);
  const record: Omit<EvidenceRecord, 'uploadedAt'> & { uploadedAt: unknown } = {
    id: q.id,
    ref: q.ref,
    roomId: q.roomId,
    itemId: q.itemId,
    kind: evidenceKind(q.contentType)!,
    storagePath,
    previewPath,
    originalFilename: q.originalFilename,
    contentType: q.contentType,
    size: q.size,
    sha256: q.sha256,
    claimedCapture: q.claimedCapture,
    metadata: q.metadata,
    addendum: q.addendum,
    caption: q.caption,
    uploadedBy: q.actor.uid,
    uploadedByName: q.actor.name,
    uploadedAt: serverTimestamp(),
  };
  b.set(doc(db, `properties/${q.propertyId}/inspections/${q.inspectionId}/evidence/${q.id}`), clean(record));
  await b.commit();
  // Audit is best effort: a former member keeps adding addenda to inspections they took part in.
  const a = writeBatch(db);
  addAudit(a, q.propertyId, q.actor, {
    action: 'evidence.uploaded',
    kind: q.addendum ? 'addition' : 'create',
    target: { type: 'evidence', id: q.id },
    summary: `${q.actor.name} uploaded ${q.ref}${q.addendum ? ' (added after completion)' : ''}`,
    details: { sha256: q.sha256, inspectionId: q.inspectionId },
  });
  await a.commit().catch(() => undefined);
}

export async function processQueue() {
  if (running) return;
  running = true;
  try {
    await refresh();
    for (const q of snapshot) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      if (q.state === 'failed' && q.attempts >= 5) continue;
      await set(q.id, { ...q, state: 'uploading' }, store);
      await refresh();
      try {
        await uploadItem(q);
        await del(q.id, store);
      } catch (e) {
        const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
        const permanent = code === 'permission-denied' || code === 'storage/unauthorized';
        await set(q.id, { ...q, state: 'failed', attempts: permanent ? 99 : q.attempts + 1, error: permanent ? 'You no longer have permission to add evidence here.' : 'Upload failed. It will retry automatically.' }, store);
      }
      await refresh();
    }
  } finally {
    running = false;
  }
}

export async function retryUpload(id: string) {
  const q = snapshot.find((x) => x.id === id);
  if (q) await set(id, { ...q, state: 'queued', attempts: 0, error: undefined }, store);
  await processQueue();
}

export async function discardUpload(id: string) {
  await del(id, store);
  await refresh();
}

export function startUploadWorker() {
  void processQueue();
  window.addEventListener('online', () => void processQueue());
  setInterval(() => void processQueue(), 60_000);
}

// ---- private file display (always through security rules, never public URLs) ----

const blobUrls = new Map<string, Promise<string>>();

export function storageObjectUrl(path: string): Promise<string> {
  let p = blobUrls.get(path);
  if (!p) {
    p = getBlob(ref(getStorageInstance(), path)).then((b) => URL.createObjectURL(b));
    p.catch(() => blobUrls.delete(path));
    blobUrls.set(path, p);
  }
  return p;
}

export async function storageBlob(path: string): Promise<Blob> {
  return getBlob(ref(getStorageInstance(), path));
}

export async function storageServerMetadata(path: string) {
  const m = await getMetadata(ref(getStorageInstance(), path));
  return { timeCreated: m.timeCreated, md5Hash: m.md5Hash, size: m.size };
}
