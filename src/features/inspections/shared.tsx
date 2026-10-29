import { Camera, Check, CircleSlash, CloudOff, HelpCircle, ImagePlus, RotateCw, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getMarket } from '@/config/markets';
import { captureGap, timeStatements, validateEvidenceFile } from '@/domain/evidence';
import { CONDITION_LABELS, type EvidenceRecord, type Inspection, type ItemCondition } from '@/domain/inspection/types';
import { TEAM_ROLES } from '@/domain/roles';
import { useEvidence, useInspection, useSignatures } from '@/data/inspections';
import { useProperty } from '@/data/properties';
import { fmtClaimed, fmtInstant } from '@/lib/format';
import { toDate } from '@/lib/live';
import { discardUpload, queueEvidence, retryUpload, storageObjectUrl, type QueuedUpload } from '@/lib/uploads';
import { useUploads } from '@/app/AppShell';
import { useAuthed } from '@/app/session';
import { Dialog } from '@/ui/Dialog';
import { Button } from '@/ui/Button';
import { useToast } from '@/ui/Toast';
import { cx } from '@/ui/cx';
import { Spinner } from '@/ui/Spinner';

export function useInspectionContext(pid: string | undefined, iid: string | undefined) {
  const { user } = useAuthed();
  const insp = useInspection(pid, iid);
  // The property may be unreadable (e.g. the person left it); the inspection still works read-only.
  const prop = useProperty(pid);
  const evidence = useEvidence(pid, iid);
  const signatures = useSignatures(pid, iid);
  const uploads = useUploads().filter((u) => u.inspectionId === iid);
  const i = insp.data;
  const p = prop.data;
  const isTeam = Boolean(p && (p.ownerUid === user.uid || TEAM_ROLES.includes(p.members[user.uid]?.role ?? 'tenant')));
  const canEdit = Boolean(i && i.status === 'draft' && (i.editorIds.includes(user.uid) || (i.createdByTeam && isTeam)));
  const canAddendum = Boolean(i && i.status === 'completed');
  return {
    i,
    p,
    loading: insp.loading,
    error: insp.error,
    evidence: evidence.data,
    signatures: signatures.data,
    uploads,
    isTeam,
    canEdit,
    canAddendum,
    market: getMarket(p?.marketId),
  };
}

export const CONDITION_STYLES: Record<ItemCondition, { on: string; icon: typeof Check }> = {
  good: { on: 'bg-good text-white border-good', icon: Check },
  defective: { on: 'bg-bad text-white border-bad', icon: X },
  not_tested: { on: 'bg-warn text-white border-warn', icon: HelpCircle },
  na: { on: 'bg-ink-3 text-white border-ink-3', icon: CircleSlash },
};

export function ConditionPicker({ value, onChange, disabled, label }: { value: ItemCondition | null; onChange: (c: ItemCondition) => void; disabled?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={`Condition of ${label}`} className="grid grid-cols-4 gap-1.5">
      {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map((c) => {
        const S = CONDITION_STYLES[c];
        const on = value === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={CONDITION_LABELS[c]}
            disabled={disabled}
            onClick={() => onChange(c)}
            className={cx('flex h-11 items-center justify-center gap-1 rounded-xl border px-1 text-[12px] font-semibold tracking-tight whitespace-nowrap transition-colors disabled:opacity-60 sm:text-[13px]', on ? S.on : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2')}
          >
            <S.icon className="size-4 shrink-0" />
            <span className="hidden min-[360px]:inline">{CONDITION_LABELS[c]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ConditionBadge({ c }: { c: ItemCondition | null }) {
  if (!c) return <span className="rounded-full bg-muted-soft px-2 py-0.5 text-xs font-semibold text-muted-ink">Not inspected</span>;
  const cls = { good: 'bg-good-soft text-good-ink', defective: 'bg-bad-soft text-bad-ink', not_tested: 'bg-warn-soft text-warn-ink', na: 'bg-muted-soft text-muted-ink' }[c];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{CONDITION_LABELS[c]}</span>;
}

/** Camera-first photo input. Photos are saved to the device and uploaded in the background. */
export function AddPhotoButton({ i, roomId, itemId, addendum, compact }: { i: Inspection; roomId: string; itemId?: string; addendum: boolean; compact?: boolean }) {
  const { actor } = useAuthed();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let added = 0;
    for (const file of Array.from(files)) {
      const problem = validateEvidenceFile(file);
      if (problem) {
        toast(`${file.name}: ${problem}`, 'bad');
        continue;
      }
      try {
        await queueEvidence(file, { propertyId: i.propertyId, inspectionId: i.id, roomId, itemId, addendum }, actor);
        added++;
      } catch {
        toast(`${file.name} could not be saved on this device.`, 'bad');
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    if (added) toast(added === 1 ? 'Photo saved. Uploading…' : `${added} photos saved. Uploading…`);
  };
  return (
    <>
      <input ref={input} type="file" accept="image/*,video/mp4,video/quicktime" capture="environment" multiple className="sr-only" onChange={(e) => void onFiles(e.target.files)} aria-label="Add photo or video" tabIndex={-1} />
      <Button variant={compact ? 'ghost' : 'soft'} size="sm" loading={busy} icon={<Camera className="size-4" />} onClick={() => input.current?.click()}>
        {compact ? 'Photo' : addendum ? 'Add later photo' : 'Add photo'}
      </Button>
    </>
  );
}

export function LibraryButton({ i, roomId, itemId, addendum }: { i: Inspection; roomId: string; itemId?: string; addendum: boolean }) {
  const { actor } = useAuthed();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/mp4,video/quicktime"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose photos"
        onChange={async (e) => {
          for (const file of Array.from(e.target.files ?? [])) {
            const problem = validateEvidenceFile(file);
            if (problem) toast(`${file.name}: ${problem}`, 'bad');
            else await queueEvidence(file, { propertyId: i.propertyId, inspectionId: i.id, roomId, itemId, addendum }, actor).catch(() => toast('Could not save the file on this device.', 'bad'));
          }
          e.target.value = '';
        }}
      />
      <Button variant="ghost" size="sm" icon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()}>
        Library
      </Button>
    </>
  );
}

function useObjectUrl(path: string | undefined) {
  const [state, setState] = useState<{ path: string; url: string | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    storageObjectUrl(path).then(
      (url) => live && setState({ path, url, failed: false }),
      () => live && setState({ path, url: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  return state && state.path === path ? state : null;
}

function useLocalUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    // Subscribing to an external resource; the URL is released on cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return blob ? url : null;
}

export function EvidenceThumb({ e, onOpen }: { e: EvidenceRecord; onOpen: () => void }) {
  const img = useObjectUrl(e.previewPath ?? (e.kind === 'photo' ? e.storagePath : undefined));
  return (
    <button type="button" onClick={onOpen} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2" aria-label={`Open evidence ${e.ref}`}>
      {img?.url ? <img src={img.url} alt={e.caption || e.ref} className="size-full object-cover transition-transform group-hover:scale-105" /> : <span className="flex size-full items-center justify-center text-xs text-ink-3">{img?.failed ? 'Unavailable' : e.kind === 'video' ? 'Video' : <Spinner className="size-4" />}</span>}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] font-semibold text-white">{e.ref}</span>
      {e.addendum && <span className="absolute top-1 left-1 rounded bg-info px-1 text-[10px] font-bold text-white">Later</span>}
    </button>
  );
}

function QueuedThumb({ q }: { q: QueuedUpload }) {
  const url = useLocalUrl(q.preview ?? (q.contentType.startsWith('image/') ? q.file : undefined));
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-dashed border-warn bg-warn-soft">
      {url && <img src={url} alt="" className="size-full object-cover opacity-70" />}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/25 p-1 text-center text-[10px] font-bold text-white">
        {q.state === 'failed' ? (
          <>
            <CloudOff className="size-4" />
            Not uploaded
            <span className="flex gap-1">
              <button type="button" className="rounded bg-white/90 px-1.5 py-0.5 text-ink" onClick={() => void retryUpload(q.id)} aria-label="Retry upload">
                <RotateCw className="size-3" />
              </button>
              {q.attempts >= 99 && (
                <button type="button" className="rounded bg-white/90 px-1.5 py-0.5 text-ink" onClick={() => void discardUpload(q.id)} aria-label="Discard">
                  <X className="size-3" />
                </button>
              )}
            </span>
          </>
        ) : (
          <>
            <Spinner className="size-4" />
            {q.state === 'uploading' ? 'Uploading' : navigator.onLine ? 'Queued' : 'Saved offline'}
          </>
        )}
      </div>
    </div>
  );
}

export function EvidenceGrid({ evidence, queued, empty }: { evidence: EvidenceRecord[]; queued: QueuedUpload[]; empty?: string }) {
  const [open, setOpen] = useState<EvidenceRecord | null>(null);
  if (evidence.length === 0 && queued.length === 0) return empty ? <p className="text-xs text-ink-3">{empty}</p> : null;
  return (
    <>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {evidence.map((e) => (
          <EvidenceThumb key={e.id} e={e} onOpen={() => setOpen(e)} />
        ))}
        {queued.map((q) => (
          <QueuedThumb key={q.id} q={q} />
        ))}
      </div>
      {open && <EvidenceViewer e={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function EvidenceViewer({ e, onClose }: { e: EvidenceRecord; onClose: () => void }) {
  const { market } = useAuthed();
  const original = useObjectUrl(e.storagePath);
  const preview = useObjectUrl(e.previewPath);
  const url = original?.url ?? preview?.url;
  const times = {
    uploadedAt: toDate(e.uploadedAt),
    exifTakenAt: toDate(e.claimedCapture.exifTakenAt),
    fileModifiedAt: toDate(e.claimedCapture.fileModifiedAt),
    addedOnDeviceAt: toDate(e.claimedCapture.addedOnDeviceAt) ?? new Date(0),
  };
  const gap = captureGap(times);
  return (
    <Dialog open onClose={onClose} title={`Evidence ${e.ref}`} description={e.originalFilename} wide>
      <div className="space-y-4 pb-2">
        <div className="overflow-hidden rounded-xl bg-surface-2">
          {url ? e.kind === 'video' ? <video src={url} controls className="max-h-[60dvh] w-full" /> : <img src={url} alt={e.caption || e.ref} className="max-h-[60dvh] w-full object-contain" /> : <div className="flex h-48 items-center justify-center"><Spinner /></div>}
        </div>
        {gap && <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-ink">{gap.message}</div>}
        <dl className="space-y-2.5 text-sm">
          {timeStatements(times).map((t) => (
            <div key={t.label} className="flex flex-wrap items-baseline justify-between gap-x-4">
              <dt className="flex items-center gap-1.5 font-semibold text-ink-2">
                {t.verified && <ShieldCheck className="size-4 text-good" />}
                {t.label}
              </dt>
              <dd className="text-ink tabular-nums">{t.label.startsWith('Taken') ? fmtClaimed(e.claimedCapture.exifTakenAt, market) : fmtInstant(t.value, market)}</dd>
              <dd className="w-full text-xs text-ink-3">{t.note}</dd>
            </div>
          ))}
          <div className="border-t border-line pt-2.5">
            <dt className="font-semibold text-ink-2">SHA-256 of the original file</dt>
            <dd className="mt-0.5 font-mono text-xs break-all text-ink-3">{e.sha256}</dd>
            <dd className="text-xs text-ink-3">Computed on the uploader’s device before upload. Anyone with the original file can recompute it to check it hasn’t changed.</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-3">
            <span>Uploaded by {e.uploadedByName}</span>
            <span>
              {(e.size / 1024 / 1024).toFixed(2)} MB{e.metadata.width ? ` · ${e.metadata.width}×${e.metadata.height}` : ''}
              {e.metadata.model ? ` · ${e.metadata.make ?? ''} ${e.metadata.model}` : ''}
            </span>
          </div>
          {e.addendum && <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info-ink">Added after the inspection was completed. It is not part of the completed record’s content hash.</p>}
        </dl>
      </div>
    </Dialog>
  );
}

