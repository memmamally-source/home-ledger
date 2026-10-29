import { PenLine } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { defectsOf, sortedItems, sortedRooms } from '@/domain/inspection/logic';
import type { Agreement } from '@/domain/inspection/types';
import { signInspection } from '@/data/inspections';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ErrorNote, InfoNote } from '@/ui/EmptyState';
import { TextArea, TextField } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { SignaturePad } from '@/ui/SignaturePad';
import { LoadingBlock } from '@/ui/Spinner';
import { useToast } from '@/ui/Toast';
import { cx } from '@/ui/cx';
import { ConditionBadge, useInspectionContext } from './shared';

const AGREEMENT: { value: Agreement; label: string; text: string }[] = [
  { value: 'agree', label: 'I agree', text: 'The report reflects the condition of the property.' },
  { value: 'partial', label: 'I partly agree', text: 'Most of it is right, but I dispute some findings.' },
  { value: 'disagree', label: 'I disagree', text: 'I don’t accept the report’s findings.' },
];

export function SignPage() {
  const { pid, iid } = useParams();
  const ctx = useInspectionContext(pid, iid);
  const { user, actor } = useAuthed();
  const nav = useNavigate();
  const toast = useToast();
  const [received, setReceived] = useState(false);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [comment, setComment] = useState('');
  const [disputed, setDisputed] = useState<string[]>([]);
  const [name, setName] = useState(actor.name);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (ctx.loading) return <LoadingBlock />;
  const i = ctx.i;
  const role = ctx.p?.members[user.uid]?.role;
  if (!i || i.status !== 'completed') return <ErrorNote>Only completed inspections can be signed.</ErrorNote>;
  if (!role) return <ErrorNote>Only current members of the property can sign.</ErrorNote>;
  if (ctx.signatures.some((s) => s.uid === user.uid)) return <ErrorNote>You have already signed this inspection. A signature can’t be changed.</ErrorNote>;
  const items = sortedRooms(i.rooms).flatMap((room) => sortedItems(room).map((item) => ({ room, item })));
  const defects = new Set(defectsOf(i.rooms).map((d) => d.item.id));
  const needsDetail = agreement && agreement !== 'agree';

  const submit = async () => {
    if (!received) return setError('Confirm that you received the report.');
    if (!agreement) return setError('Choose whether you agree with the findings.');
    if (needsDetail && !comment.trim() && disputed.length === 0) return setError('Say what you dispute: pick the items or add a comment.');
    if (!sig) return setError('Add your signature.');
    if (!name.trim()) return setError('Enter your name.');
    setBusy(true);
    setError('');
    try {
      await signInspection(i, { name: name.trim(), role, agreement, comment, disputedItemIds: needsDetail ? disputed : [], signatureImage: sig }, actor);
      toast('Signature recorded');
      nav(`/properties/${pid}/inspections/${iid}/report`, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="animate-rise mx-auto max-w-3xl">
      <PageHeader back={{ to: `/properties/${pid}/inspections/${iid}`, label: i.title }} title="Sign inspection" subtitle="Your signature is saved once and can’t be edited by you or anyone else." />
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold text-ink">1. Receipt</h2>
          <label className="flex items-start gap-3 text-sm text-ink-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={received} onChange={(e) => setReceived(e.target.checked)} />I confirm I have received and been able to read this inspection report.
          </label>
          <InfoNote>Acknowledging receipt is not the same as agreeing. You choose that separately below.</InfoNote>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-semibold text-ink">2. Do you agree with the findings?</h2>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Agreement">
            {AGREEMENT.map((a) => (
              <button key={a.value} type="button" role="radio" aria-checked={agreement === a.value} onClick={() => setAgreement(a.value)} className={cx('rounded-xl border p-3.5 text-left', agreement === a.value ? 'border-accent ring-2 ring-accent/25' : 'border-line')}>
                <div className="font-semibold text-ink">{a.label}</div>
                <div className="mt-0.5 text-xs text-ink-3">{a.text}</div>
              </button>
            ))}
          </div>
          {needsDetail && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-ink-2">Which findings do you dispute?</div>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                {items.map(({ room, item }) => (
                  <label key={item.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={disputed.includes(item.id)} onChange={(e) => setDisputed(e.target.checked ? [...disputed, item.id] : disputed.filter((x) => x !== item.id))} />
                    <span className={cx('flex-1', defects.has(item.id) && 'font-semibold')}>
                      {room.name}: {item.label}
                    </span>
                    <ConditionBadge c={item.condition} />
                  </label>
                ))}
              </div>
            </div>
          )}
          <TextArea label={needsDetail ? 'Explain what you dispute' : 'Comments'} optional={!needsDetail} value={comment} onChange={setComment} rows={3} />
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <PenLine className="size-5 text-accent" /> 3. Signature
          </h2>
          <TextField label="Full name" value={name} onChange={setName} />
          <SignaturePad onChange={setSig} />
          <p className="text-xs leading-relaxed text-ink-3">
            The server records the time you sign, and your signature is tied to this report’s content hash ({i.contentHash?.slice(0, 12)}…). This is an electronic acknowledgement within the app; whether it meets any legal signing requirement depends on your jurisdiction.
          </p>
        </Card>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button size="lg" className="w-full" loading={busy} onClick={submit}>
          Sign
        </Button>
      </div>
    </div>
  );
}
