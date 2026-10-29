import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { completionCheck, defectsOf, inspectionProgress } from '@/domain/inspection/logic';
import { SEVERITY_LABELS } from '@/domain/inspection/types';
import { completeInspection } from '@/data/inspections';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card, CardHeader } from '@/ui/Card';
import { ErrorNote, InfoNote } from '@/ui/EmptyState';
import { PageHeader } from '@/ui/PageHeader';
import { LoadingBlock } from '@/ui/Spinner';
import { useToast } from '@/ui/Toast';
import { useInspectionContext } from './shared';

export function ReviewPage() {
  const { pid, iid } = useParams();
  const ctx = useInspectionContext(pid, iid);
  const { actor } = useAuthed();
  const nav = useNavigate();
  const toast = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (ctx.loading) return <LoadingBlock />;
  const i = ctx.i;
  if (!i) return <ErrorNote>This inspection isn’t available.</ErrorNote>;
  if (i.status !== 'draft') return <ErrorNote>This inspection is already {i.status === 'void' ? 'voided' : 'completed'}.</ErrorNote>;
  if (!ctx.canEdit) return <ErrorNote>Only the author or their team can complete this inspection.</ErrorNote>;
  const check = completionCheck(i);
  const pr = inspectionProgress(i.rooms);
  const defects = defectsOf(i.rooms);
  const pendingUploads = ctx.uploads.length;
  const offline = !navigator.onLine;
  const needsConfirm = check.warnings.length > 0;

  const complete = async () => {
    setBusy(true);
    setError('');
    try {
      await completeInspection(i, actor);
      toast('Inspection completed');
      nav(`/properties/${pid}/inspections/${iid}/report`, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="animate-rise mx-auto max-w-3xl">
      <PageHeader back={{ to: `/properties/${pid}/inspections/${iid}`, label: i.title }} title="Review and complete" subtitle="Completing locks the checklist and records the server time and a content hash." />
      <div className="space-y-4">
        <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-5">
          {[
            ['Checked', `${pr.checked}/${pr.total}`],
            ['Good', pr.good],
            ['Defective', pr.defective],
            ['Not tested', pr.notTested],
            ['Not inspected', pr.unchecked],
          ].map(([l, v]) => (
            <div key={l}>
              <div className="text-xs font-semibold text-ink-3">{l}</div>
              <div className="font-display text-2xl font-semibold text-ink tabular-nums">{v}</div>
            </div>
          ))}
        </Card>

        {check.blocking.map((b) => (
          <ErrorNote key={b}>{b}</ErrorNote>
        ))}
        {pendingUploads > 0 && <ErrorNote>{pendingUploads} photo{pendingUploads === 1 ? ' is' : 's are'} still uploading. Wait for {pendingUploads === 1 ? 'it' : 'them'} to finish so they are included in the completed record.</ErrorNote>}
        {offline && <ErrorNote>You’re offline. Completing needs a connection so the server can record the time.</ErrorNote>}

        {check.unchecked.length > 0 && (
          <Card className="pb-4">
            <CardHeader title={`${check.unchecked.length} items not inspected`} subtitle="They will appear in the report as “Not inspected”." icon={<AlertTriangle className="size-5" />} />
            <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto px-5 text-sm">
              {check.unchecked.map(({ room, item }) => (
                <li key={item.id}>
                  <Link to={`/properties/${pid}/inspections/${iid}/rooms/${room.id}`} className="text-ink-2 hover:text-accent">
                    {room.name}: {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {defects.length > 0 && (
          <Card className="pb-4">
            <CardHeader title={`${defects.length} defects recorded`} icon={<AlertTriangle className="size-5" />} />
            <ul className="mt-3 divide-y divide-line">
              {defects.map(({ room, item }) => (
                <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm">
                  <Link to={`/properties/${pid}/inspections/${iid}/rooms/${room.id}`} className="min-w-0">
                    <div className="font-semibold text-ink">
                      {room.name}: {item.label}
                    </div>
                    <div className={item.defectDescription || item.comment ? 'text-ink-3' : 'text-warn'}>{item.defectDescription || item.comment || 'No description yet'}</div>
                  </Link>
                  <Badge tone={item.severity === 'urgent' || item.severity === 'major' ? 'bad' : 'warn'}>{SEVERITY_LABELS[item.severity ?? 'minor']}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {check.blocking.length === 0 && check.warnings.length === 0 && (
          <InfoNote tone="accent" icon={<CheckCircle2 className="size-4" />}>
            Every item has been marked.
          </InfoNote>
        )}

        <Card className="space-y-4 p-5">
          {needsConfirm && (
            <label className="flex items-start gap-3 text-sm text-ink-2">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                I understand: {check.warnings.join(' ')} The checklist cannot be changed after completing.
              </span>
            </label>
          )}
          <div className="flex items-start gap-3 text-sm text-ink-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
            After completion, other participants can sign it, add their own comments and add later photos, which are kept separately.
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button size="lg" className="w-full" loading={busy} disabled={check.blocking.length > 0 || pendingUploads > 0 || offline || (needsConfirm && !confirmed)} onClick={complete}>
            Complete inspection
          </Button>
        </Card>
      </div>
    </div>
  );
}
