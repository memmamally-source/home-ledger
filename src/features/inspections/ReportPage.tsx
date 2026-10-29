import { Download, PenLine, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { writeBatch } from 'firebase/firestore';
import { defectsOf, inspectionProgress, sortedItems, sortedRooms } from '@/domain/inspection/logic';
import { INSPECTION_TYPE_LABELS, SEVERITY_LABELS, type EvidenceRecord } from '@/domain/inspection/types';
import { ROLE_LABELS } from '@/domain/roles';
import { addAudit } from '@/data/common';
import { getDb } from '@/lib/firebase';
import { fmtDate, fmtInstant } from '@/lib/format';
import { storageBlob } from '@/lib/uploads';
import { useAuthed } from '@/app/session';
import { Badge } from '@/ui/Badge';
import { Button, ButtonLink } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ErrorNote, InfoNote } from '@/ui/EmptyState';
import { PageHeader } from '@/ui/PageHeader';
import { LoadingBlock } from '@/ui/Spinner';
import { useToast } from '@/ui/Toast';
import { ConditionBadge, EvidenceGrid, useInspectionContext } from './shared';

async function loadImage(e: EvidenceRecord) {
  if (e.kind !== 'photo') return null;
  const blob = await storageBlob(e.previewPath ?? e.storagePath);
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.8), width: canvas.width, height: canvas.height };
}

export function ReportPage() {
  const { pid, iid } = useParams();
  const ctx = useInspectionContext(pid, iid);
  const { actor, user } = useAuthed();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (ctx.loading) return <LoadingBlock />;
  const i = ctx.i;
  if (!i) return <ErrorNote>This inspection isn’t available.</ErrorNote>;
  const { market } = ctx;
  const pr = inspectionProgress(i.rooms);
  const defects = defectsOf(i.rooms);
  const fileName = `${i.propertyName}-${i.type}-${i.inspectionDate}.pdf`.replace(/[^\w.-]+/g, '-');

  const build = async () => {
    const { buildInspectionReport } = await import('@/lib/pdf/inspectionReport');
    const blob = await buildInspectionReport({ inspection: i, evidence: ctx.evidence, signatures: ctx.signatures, market, generatedBy: actor.name, loadImage, onProgress: (d, t) => setBusy(`Adding photos ${d}/${t}…`) });
    if (ctx.p) {
      const b = writeBatch(getDb());
      addAudit(b, i.propertyId, actor, { action: 'report.generated', kind: 'review', target: { type: 'inspection', id: i.id }, summary: `${actor.name} generated a PDF report of "${i.title}"` });
      void b.commit().catch(() => undefined);
    }
    return blob;
  };

  const download = async () => {
    setBusy('Preparing PDF…');
    try {
      const blob = await build();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast('The PDF could not be created. Check your connection and try again.', 'bad');
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy('Preparing PDF…');
    try {
      const file = new File([await build()], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: i.title });
      else toast('Sharing files isn’t supported in this browser. Use Download instead.', 'bad');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('The PDF could not be shared.', 'bad');
    } finally {
      setBusy(null);
    }
  };

  const signedByMe = ctx.signatures.some((s) => s.uid === user.uid);
  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: `/properties/${pid}/inspections/${iid}`, label: i.title }}
        eyebrow="Inspection report"
        title={i.title}
        subtitle={`${i.propertyName} · ${fmtDate(i.inspectionDate, market)}`}
        actions={
          <>
            <Button icon={<Download className="size-4" />} loading={busy !== null} onClick={download}>
              {busy ?? 'Download PDF'}
            </Button>
            {typeof navigator.share === 'function' && (
              <Button variant="secondary" icon={<Share2 className="size-4" />} disabled={busy !== null} onClick={share}>
                Share
              </Button>
            )}
            {i.status === 'completed' && !signedByMe && ctx.p?.members[user.uid] && (
              <ButtonLink to="../sign" variant="secondary" icon={<PenLine className="size-4" />}>
                Sign
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="space-y-4">
        {i.status === 'draft' && <InfoNote tone="warn">This is a draft. The report is marked as not completed and may still change.</InfoNote>}
        <InfoNote>Email delivery isn’t set up yet, so the app doesn’t send reports. Download or share the PDF yourself.</InfoNote>

        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <dl className="space-y-2 text-sm">
            <Pair k="Type" v={INSPECTION_TYPE_LABELS[i.type]} />
            <Pair k="Address" v={i.propertyAddress} />
            <Pair k="Tenant" v={i.parties.tenantName} />
            <Pair k="Landlord" v={i.parties.landlordName} />
            <Pair k="Inspected by" v={i.parties.inspectorName} />
          </dl>
          <dl className="space-y-2 text-sm">
            <Pair k="Status" v={i.status === 'completed' ? 'Completed' : i.status === 'void' ? `Void: ${i.voidReason}` : 'Draft'} />
            <Pair k="Completed (server)" v={i.completedAt ? fmtInstant(i.completedAt, market) : '—'} />
            <Pair k="Items" v={`${pr.good} good · ${pr.defective} defective · ${pr.notTested} not tested · ${pr.na} N/A · ${pr.unchecked} not inspected`} />
            <Pair k="Evidence" v={`${ctx.evidence.length} files`} />
            {i.contentHash && <Pair k="Content hash" v={i.contentHash} mono />}
          </dl>
        </Card>

        {defects.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold text-ink">Defects ({defects.length})</h2>
            <ul className="mt-3 divide-y divide-line text-sm">
              {defects.map(({ room, item }) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <div className="font-semibold text-ink">
                      {room.name}: {item.label}
                    </div>
                    <div className="text-ink-3">{[item.defectDescription, item.comment].filter(Boolean).join(' · ') || 'No description'}</div>
                  </div>
                  <Badge tone="bad">{SEVERITY_LABELS[item.severity ?? 'minor']}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {sortedRooms(i.rooms).map((room) => (
          <Card key={room.id} className="p-5">
            <h2 className="font-semibold text-ink">{room.name}</h2>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-line">
                {sortedItems(room).map((item) => (
                  <tr key={item.id}>
                    <td className="py-1.5 pr-3 text-ink">{item.label}</td>
                    <td className="py-1.5 pr-3">
                      <ConditionBadge c={item.condition} />
                    </td>
                    <td className="py-1.5 text-ink-3">{[item.defectDescription, item.comment].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {room.notes && <p className="mt-3 text-sm text-ink-2">{room.notes}</p>}
            <div className="mt-3">
              <EvidenceGrid evidence={ctx.evidence.filter((e) => e.roomId === room.id)} queued={[]} />
            </div>
          </Card>
        ))}

        <Card className="p-5">
          <h2 className="font-semibold text-ink">Signatures</h2>
          {ctx.signatures.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">No signatures yet.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {ctx.signatures.map((s) => (
                <div key={s.uid} className="rounded-xl border border-line p-4">
                  <img src={s.signatureImage} alt={`Signature of ${s.name}`} className="h-16 rounded bg-white" />
                  <div className="mt-2 font-semibold text-ink">
                    {s.name} · {ROLE_LABELS[s.role]}
                  </div>
                  <div className="text-xs text-ink-3">Signed {fmtInstant(s.signedAt, market)} · receipt acknowledged</div>
                  <div className="mt-1 text-sm text-ink-2">{s.agreement === 'agree' ? 'Agrees with the findings' : s.agreement === 'partial' ? 'Partly agrees' : 'Disagrees'}</div>
                  {s.comment && <p className="mt-1 text-sm text-ink-3">“{s.comment}”</p>}
                  {s.disputedItemIds.length > 0 && <p className="mt-1 text-xs text-bad">{s.disputedItemIds.length} finding(s) disputed</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
        <p className="text-xs leading-relaxed text-ink-3">
          Server times were recorded by the app’s server. Photo capture times come from the device and aren’t verified. Items not inspected are not assumed to be in good condition. This report records observations and doesn’t decide responsibility for damage. Conditions are as marked by the inspection’s author.
        </p>
      </div>
    </div>
  );
}

function Pair({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-36 shrink-0 text-ink-3">{k}</dt>
      <dd className={mono ? 'font-mono text-xs break-all text-ink-2' : 'text-ink'}>{v || '—'}</dd>
    </div>
  );
}
