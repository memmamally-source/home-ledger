import { AlertTriangle, Ban, Camera, ChevronRight, FileText, Fingerprint, PenLine, Plus, Share2, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { inspectionProgress, roomProgress, sortedRooms } from '@/domain/inspection/logic';
import { ROOM_TEMPLATES, ROOM_TYPES } from '@/domain/inspection/templates';
import { INSPECTION_TYPE_LABELS, type Inspection, type RoomType } from '@/domain/inspection/types';
import { ROLE_LABELS } from '@/domain/roles';
import { addRoom, shareInspection, updateInspectionDetails, voidInspection } from '@/data/inspections';
import { fmtDate, fmtInstant } from '@/lib/format';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { INSPECTION_STATUS } from '@/features/properties/PropertyPage';
import { Badge } from '@/ui/Badge';
import { Button, ButtonLink } from '@/ui/Button';
import { Card, CardHeader } from '@/ui/Card';
import { Dialog } from '@/ui/Dialog';
import { EmptyState, ErrorNote, InfoNote } from '@/ui/EmptyState';
import { SelectField, Switch, TextArea, TextField } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { ProgressBar, ProgressRing } from '@/ui/Progress';
import { LoadingBlock } from '@/ui/Spinner';
import { useToast } from '@/ui/Toast';
import { useInspectionContext } from './shared';

export function InspectionPage() {
  const { pid, iid } = useParams();
  const ctx = useInspectionContext(pid, iid);
  const { user } = useAuthed();
  const [addingRoom, setAddingRoom] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  if (ctx.loading) return <LoadingBlock />;
  if (!ctx.i) return <ErrorNote>{ctx.error ? friendlyError(ctx.error) : 'This inspection isn’t available to you.'}</ErrorNote>;
  const { i, market } = ctx;
  const pr = inspectionProgress(i.rooms);
  const rooms = sortedRooms(i.rooms);
  const signedByMe = ctx.signatures.some((s) => s.uid === user.uid);
  const st = INSPECTION_STATUS[i.status];

  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: ctx.p ? `/properties/${i.propertyId}?tab=inspections` : '/inspections', label: i.propertyName }}
        eyebrow={i.title.startsWith(INSPECTION_TYPE_LABELS[i.type]) ? undefined : INSPECTION_TYPE_LABELS[i.type]}
        title={i.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {fmtDate(i.inspectionDate, market)} · {i.propertyAddress}
            <Badge tone={st.tone}>{st.label}</Badge>
          </span>
        }
        actions={
          <>
            {i.status === 'draft' && ctx.canEdit && (
              <ButtonLink to="review" icon={<ShieldCheck className="size-4" />}>
                Review and complete
              </ButtonLink>
            )}
            {i.status !== 'draft' && (
              <ButtonLink to="report" variant={i.status === 'completed' ? 'primary' : 'secondary'} icon={<FileText className="size-4" />}>
                Report
              </ButtonLink>
            )}
            {i.status === 'completed' && !signedByMe && ctx.p?.members[user.uid] && (
              <ButtonLink to="sign" variant="secondary" icon={<PenLine className="size-4" />}>
                Sign
              </ButtonLink>
            )}
          </>
        }
      />

      {i.status === 'void' && (
        <div className="mb-6">
          <ErrorNote>Voided: {i.voidReason}. The record is kept for the history but should not be relied on.</ErrorNote>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <ProgressRing value={pr.percent} size={56} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">
                  {pr.checked} of {pr.total} items checked
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-3">
                  <span className="text-good">{pr.good} good</span>
                  <span className="text-bad">{pr.defective} defective</span>
                  <span className="text-warn">{pr.notTested} not tested</span>
                  <span>{pr.na} N/A</span>
                  <span>{ctx.evidence.length} photos</span>
                </div>
              </div>
            </div>
            {ctx.uploads.length > 0 && <div className="mt-4 rounded-xl bg-warn-soft px-4 py-2.5 text-sm font-semibold text-warn-ink">{ctx.uploads.length} photo{ctx.uploads.length === 1 ? '' : 's'} saved on this device, waiting to upload.</div>}
          </Card>

          <div className="space-y-2">
            {rooms.map((r, idx) => {
              const rp = roomProgress(r);
              const photos = ctx.evidence.filter((e) => e.roomId === r.id).length + ctx.uploads.filter((u) => u.roomId === r.id).length;
              return (
                <Link key={r.id} to={`rooms/${r.id}`} className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent/40">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-sm font-bold text-ink-2 tabular-nums">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink">{r.name}</span>
                      {rp.defective > 0 && (
                        <Badge tone="bad" icon={<AlertTriangle className="size-3" />}>
                          {rp.defective}
                        </Badge>
                      )}
                      {photos > 0 && (
                        <span className="flex items-center gap-1 text-xs text-ink-3">
                          <Camera className="size-3.5" /> {photos}
                        </span>
                      )}
                    </div>
                    <ProgressBar className="mt-2" value={rp.percent} tone={rp.percent === 100 ? 'good' : 'accent'} label={`${r.name} progress`} />
                  </div>
                  <span className="text-xs font-semibold text-ink-3 tabular-nums">
                    {rp.checked}/{rp.total}
                  </span>
                  <ChevronRight className="size-5 text-ink-3" />
                </Link>
              );
            })}
            {rooms.length === 0 && (
              <Card>
                <EmptyState icon={<Plus className="size-6" />} title="No rooms yet">Add the rooms you want to inspect.</EmptyState>
              </Card>
            )}
            {ctx.canEdit && (
              <Button variant="soft" className="w-full" icon={<Plus className="size-4" />} onClick={() => setAddingRoom(true)}>
                Add a room or area
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="pb-5">
            <CardHeader title="Details" action={ctx.canEdit && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>} />
            <dl className="mt-3 space-y-3 px-5 text-sm">
              <Row label="Tenant" value={i.parties.tenantName} />
              <Row label="Landlord" value={i.parties.landlordName} />
              <Row label="Inspected by" value={i.parties.inspectorName} />
              <Row label="Also present" value={i.parties.othersPresent} />
              <Row label="Created by" value={`${i.createdByName} (${ROLE_LABELS[i.createdByRole]})`} />
              {i.generalNotes && <Row label="General notes" value={i.generalNotes} />}
            </dl>
          </Card>

          {i.status !== 'draft' && i.contentHash && (
            <Card className="p-5">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <Fingerprint className="size-5 text-accent" /> Record integrity
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs font-semibold text-ink-3">Completed (server time)</dt>
                  <dd className="text-ink">{fmtInstant(i.completedAt, market)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-ink-3">Content hash (SHA-256)</dt>
                  <dd className="font-mono text-[11px] break-all text-ink-2">{i.contentHash}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-3">The checklist can no longer be changed. Later photos are kept separately and marked as added later.</p>
            </Card>
          )}

          <Card className="pb-5">
            <CardHeader title="Signatures" icon={<PenLine className="size-5" />} />
            <div className="mt-3 space-y-2 px-5">
              {ctx.signatures.length === 0 ? (
                <p className="text-sm text-ink-3">{i.status === 'completed' ? 'No one has signed yet.' : 'Signing opens once the inspection is completed.'}</p>
              ) : (
                ctx.signatures.map((s) => (
                  <div key={s.uid} className="rounded-xl bg-surface-2/70 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{s.name}</span>
                      <Badge tone={s.agreement === 'agree' ? 'good' : s.agreement === 'partial' ? 'warn' : 'bad'}>{s.agreement === 'agree' ? 'Agrees' : s.agreement === 'partial' ? 'Partly agrees' : 'Disagrees'}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {ROLE_LABELS[s.role]} · {fmtInstant(s.signedAt, market)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-2">
            {i.status !== 'void' && (
              <Button variant="secondary" icon={<Share2 className="size-4" />} onClick={() => setSharing(true)}>
                Sharing
              </Button>
            )}
            {i.status !== 'void' && (i.createdBy === user.uid || (i.createdByTeam && ctx.isTeam)) && (
              <Button variant="ghost" icon={<Ban className="size-4" />} onClick={() => setVoiding(true)}>
                Void inspection
              </Button>
            )}
          </div>
        </div>
      </div>

      <AddRoomDialog open={addingRoom} onClose={() => setAddingRoom(false)} i={i} />
      {editing && <EditDetailsDialog i={i} onClose={() => setEditing(false)} />}
      {sharing && <ShareDialog ctx={ctx} onClose={() => setSharing(false)} />}
      {voiding && <VoidDialog i={i} onClose={() => setVoiding(false)} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-3">{label}</dt>
      <dd className="whitespace-pre-wrap text-ink">{value}</dd>
    </div>
  );
}

function AddRoomDialog({ open, onClose, i }: { open: boolean; onClose: () => void; i: Inspection }) {
  const nav = useNavigate();
  const toast = useToast();
  const [type, setType] = useState<RoomType>('bedroom');
  const [name, setName] = useState('');
  const [withItems, setWithItems] = useState(true);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const id = await addRoom(i, type, name || ROOM_TEMPLATES[type].label, withItems);
      onClose();
      nav(`rooms/${id}`);
    } catch (e) {
      toast(friendlyError(e), 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add a room or area" footer={<Button loading={busy} onClick={add}>Add room</Button>}>
      <div className="space-y-4 pb-2">
        <SelectField label="Type" value={type} onChange={setType} options={ROOM_TYPES.map((r) => ({ value: r, label: ROOM_TEMPLATES[r].label }))} />
        <TextField label="Name" optional value={name} onChange={setName} placeholder={ROOM_TEMPLATES[type].label} hint="E.g. “Main bedroom” or “Back garden”." />
        <Switch checked={withItems} onChange={setWithItems} label="Start with the standard checklist" description="Off gives an empty room for your own items." />
      </div>
    </Dialog>
  );
}

function EditDetailsDialog({ i, onClose }: { i: Inspection; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(i.title);
  const [date, setDate] = useState(i.inspectionDate);
  const [parties, setParties] = useState(i.parties);
  const [notes, setNotes] = useState(i.generalNotes);
  const save = () => {
    updateInspectionDetails(i, { title: title.trim() || i.title, inspectionDate: date, parties, generalNotes: notes }).catch((e) => toast(friendlyError(e), 'bad'));
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Inspection details" footer={<Button onClick={save}>Save</Button>}>
      <div className="space-y-4 pb-2">
        <TextField label="Title" value={title} onChange={setTitle} />
        <TextField label="Date" type="date" value={date} onChange={setDate} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Tenant" optional value={parties.tenantName ?? ''} onChange={(v) => setParties({ ...parties, tenantName: v })} />
          <TextField label="Landlord" optional value={parties.landlordName ?? ''} onChange={(v) => setParties({ ...parties, landlordName: v })} />
          <TextField label="Inspected by" optional value={parties.inspectorName ?? ''} onChange={(v) => setParties({ ...parties, inspectorName: v })} />
          <TextField label="Also present" optional value={parties.othersPresent ?? ''} onChange={(v) => setParties({ ...parties, othersPresent: v })} />
        </div>
        <TextArea label="General notes" optional value={notes} onChange={setNotes} />
      </div>
    </Dialog>
  );
}

function ShareDialog({ ctx, onClose }: { ctx: ReturnType<typeof useInspectionContext>; onClose: () => void }) {
  const { actor } = useAuthed();
  const toast = useToast();
  const i = ctx.i!;
  const p = ctx.p;
  const candidates = p ? p.memberIds.filter((u) => !i.participantIds.includes(u)) : [];
  const [chosen, setChosen] = useState<string[]>([]);
  const [team, setTeam] = useState(i.teamVisible);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await shareInspection(i, { addParticipants: chosen, teamVisible: team && !i.teamVisible }, actor);
      toast('Sharing updated');
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'bad');
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Sharing" description="Sharing gives view access. Only the author and their team can edit a draft." footer={<Button loading={busy} disabled={chosen.length === 0 && team === i.teamVisible} onClick={save}>Share</Button>}>
      <div className="space-y-4 pb-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-2">
            <Users className="size-4" /> Can see it now
          </div>
          <ul className="space-y-1 text-sm text-ink">
            {i.participantIds.map((u) => (
              <li key={u}>{p?.members[u]?.displayName ?? (u === i.createdBy ? i.createdByName : 'A former member')}</li>
            ))}
            {i.teamVisible && <li className="text-ink-3">The property owner’s team</li>}
          </ul>
        </div>
        {!i.teamVisible && <Switch checked={team} onChange={setTeam} label="Share with the property owner’s team" description="Owners, co-owners, managers and agents on this property." />}
        {candidates.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-ink-2">Add people on this property</div>
            {candidates.map((u) => (
              <label key={u} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={chosen.includes(u)} onChange={(e) => setChosen(e.target.checked ? [...chosen, u] : chosen.filter((x) => x !== u))} />
                <span className="text-sm text-ink">
                  {p!.members[u]!.displayName} <span className="text-ink-3">· {ROLE_LABELS[p!.members[u]!.role]}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <InfoNote tone="warn">Sharing can’t be withdrawn. People keep access to inspections shared with them, even if they later leave the property.</InfoNote>
      </div>
    </Dialog>
  );
}

function VoidDialog({ i, onClose }: { i: Inspection; onClose: () => void }) {
  const { actor } = useAuthed();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Void this inspection?"
      description="Nothing is deleted. It stays in the history, marked void with your reason."
      footer={
        <Button
          variant="danger"
          loading={busy}
          disabled={!reason.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await voidInspection(i, reason, actor);
              toast('Inspection voided');
              onClose();
            } catch (e) {
              toast(friendlyError(e), 'bad');
              setBusy(false);
            }
          }}
        >
          Void inspection
        </Button>
      }
    >
      <TextArea label="Reason" value={reason} onChange={setReason} rows={2} placeholder="E.g. started on the wrong property" />
    </Dialog>
  );
}
