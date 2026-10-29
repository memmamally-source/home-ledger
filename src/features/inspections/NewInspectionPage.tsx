import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { getMarket } from '@/config/markets';
import { todayIn } from '@/domain/dates';
import { DEFAULT_ROOMS, ROOM_TEMPLATES, ROOM_TYPES } from '@/domain/inspection/templates';
import { INSPECTION_TYPE_LABELS, type InspectionType, type RoomType } from '@/domain/inspection/types';
import { capsFor, useProperty } from '@/data/properties';
import { createInspection } from '@/data/inspections';
import { useTenancies } from '@/data/tenancies';
import type { Property } from '@/domain/property';
import type { Tenancy } from '@/domain/tenancy';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ErrorNote, InfoNote } from '@/ui/EmptyState';
import { SelectField, Switch, TextField } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { LoadingBlock } from '@/ui/Spinner';
import { cx } from '@/ui/cx';

const TYPES = Object.keys(INSPECTION_TYPE_LABELS) as InspectionType[];

export function NewInspectionPage() {
  const { pid } = useParams();
  const { user } = useAuthed();
  const prop = useProperty(pid);
  const caps = capsFor(prop.data, user.uid);
  const tenancies = useTenancies(pid, user.uid, caps.manage);
  if (prop.loading || tenancies.loading) return <LoadingBlock />;
  if (!prop.data || !caps.inspect) return <ErrorNote>You can’t start inspections on this property.</ErrorNote>;
  return <Form key={prop.data.id} p={prop.data} tenancies={tenancies.data} />;
}

function Form({ p, tenancies }: { p: Property; tenancies: Tenancy[] }) {
  const [params] = useSearchParams();
  const { user, actor } = useAuthed();
  const nav = useNavigate();
  const caps = capsFor(p, user.uid);
  const market = getMarket(p.marketId);
  const qType = params.get('type') as InspectionType | null;
  const [type, setType] = useState<InspectionType>(qType && TYPES.includes(qType) ? qType : 'ingoing');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIn(market.timeZone));
  const [tenancyId, setTenancyId] = useState(params.get('tenancy') ?? (tenancies.length === 1 ? tenancies[0]!.id : ''));
  const tenancy = tenancies.find((t) => t.id === tenancyId);
  const [counts, setCounts] = useState<Record<RoomType, number>>(() => {
    const c = Object.fromEntries(ROOM_TYPES.map((r) => [r, 0])) as Record<RoomType, number>;
    for (const r of DEFAULT_ROOMS[p.type]) c[r]++;
    return c;
  });
  const role = p.members[user.uid]?.role;
  const linkedParties = (tenancy?.partyIds ?? []).filter((u) => u !== user.uid && p.memberIds.includes(u));
  const [shareParties, setShareParties] = useState(true);
  const [teamVisible, setTeamVisible] = useState(role === 'inspector' || role === 'landlord' || role === 'agent');
  const [inspector, setInspector] = useState(actor.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roomTypes = ROOM_TYPES.flatMap((r) => Array<RoomType>(counts[r]).fill(r));
  // keep the order sensible: the suggested order for the property type first, then the rest
  const order = [...new Set([...DEFAULT_ROOMS[p.type], ...ROOM_TYPES])];
  const sorted = [...roomTypes].sort((a, b) => order.indexOf(a) - order.indexOf(b));

  const start = async () => {
    if (sorted.length === 0) return setError('Choose at least one room. You can add more later.');
    setBusy(true);
    setError('');
    try {
      const id = await createInspection(
        p,
        {
          type,
          title: title || `${INSPECTION_TYPE_LABELS[type]} inspection`,
          inspectionDate: date,
          tenancyId: tenancyId || undefined,
          roomTypes: sorted,
          parties: { tenantName: tenancy?.tenantName, landlordName: tenancy?.landlordName, inspectorName: inspector.trim() || undefined },
          shareWith: shareParties ? linkedParties : [],
          teamVisible,
        },
        actor,
      );
      nav(`/properties/${p.id}/inspections/${id}`, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="animate-rise mx-auto max-w-3xl">
      <PageHeader eyebrow={p.name} title="New inspection" back={{ to: `/properties/${p.id}?tab=inspections`, label: p.name }} />
      <div className="space-y-6">
        <Card className="space-y-4 p-5 sm:p-6">
          <div>
            <div className="mb-1.5 text-sm font-semibold text-ink-2">Type</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Inspection type">
              {TYPES.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cx('rounded-full border px-3.5 py-1.5 text-sm font-semibold', type === t ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-2 hover:bg-surface-2')}>
                  {INSPECTION_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Title" optional value={title} onChange={setTitle} placeholder={`${INSPECTION_TYPE_LABELS[type]} inspection`} />
            <TextField label="Inspection date" type="date" value={date} onChange={setDate} />
            {tenancies.length > 0 && <SelectField label="Tenancy" optional value={tenancyId} onChange={setTenancyId} options={[{ value: '', label: 'Not linked to a tenancy' }, ...tenancies.map((t) => ({ value: t.id, label: `${t.tenantName} (from ${t.startDate})` }))]} />}
            <TextField label="Inspected by" value={inspector} onChange={setInspector} />
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold text-ink">Rooms</h2>
          <p className="mt-1 text-sm text-ink-3">Suggested for a {p.type.replace('_', '-')}. Each room comes with a detailed checklist; you can add rooms and items later.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {order.map((r) => (
              <div key={r} className={cx('flex items-center justify-between rounded-xl border px-4 py-2.5', counts[r] ? 'border-accent/40 bg-accent-soft/40' : 'border-line')}>
                <span className="text-sm font-semibold text-ink">{ROOM_TEMPLATES[r].label}</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 disabled:opacity-30" disabled={!counts[r]} onClick={() => setCounts({ ...counts, [r]: counts[r] - 1 })} aria-label={`One fewer ${ROOM_TEMPLATES[r].label}`}>
                    <Minus className="size-4" />
                  </button>
                  <span className="w-5 text-center font-semibold tabular-nums" aria-label={`${counts[r]} ${ROOM_TEMPLATES[r].label}`}>
                    {counts[r]}
                  </span>
                  <button type="button" className="flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2" onClick={() => setCounts({ ...counts, [r]: Math.min(20, counts[r] + 1) })} aria-label={`One more ${ROOM_TEMPLATES[r].label}`}>
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink">Who can see it</h2>
          {caps.manage ? (
            <p className="text-sm text-ink-3">You and your team on this property can see it.</p>
          ) : (
            <Switch checked={teamVisible} onChange={setTeamVisible} label="Share with the property owner’s team" description="Off keeps it private to you until you choose to share. You can share it later; sharing can’t be undone." />
          )}
          {linkedParties.length > 0 && <Switch checked={shareParties} onChange={setShareParties} label={`Share with the linked ${caps.manage ? 'tenant' : 'parties'} on this tenancy`} description="They can view it, add their own later photos and sign it, but not change your findings." />}
          <InfoNote>Every item starts unchecked. Anything you don’t mark is reported as “Not inspected”, never as good.</InfoNote>
        </Card>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => nav(-1)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={start}>
            Start inspection ({sorted.length} room{sorted.length === 1 ? '' : 's'})
          </Button>
        </div>
      </div>
    </div>
  );
}
