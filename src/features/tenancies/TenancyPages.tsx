import { CalendarDays, ClipboardCheck, Info, Link2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getMarket } from '@/config/markets';
import { addDays, addMonths, todayIn } from '@/domain/dates';
import { LEASE_STATUS_LABELS, leaseStatus, nextEscalation, rateOn, rentSchedule, validateTenancy, type Escalation, type Tenancy, type UtilityResponsibility } from '@/domain/tenancy';
import { capsFor, useProperty } from '@/data/properties';
import { saveTenancy, useTenancy, type TenancyInput } from '@/data/tenancies';
import { fmtDate, fmtMoney } from '@/lib/format';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { Badge } from '@/ui/Badge';
import { Button, ButtonLink } from '@/ui/Button';
import { Card, CardHeader } from '@/ui/Card';
import { ErrorNote, InfoNote } from '@/ui/EmptyState';
import { MoneyField, SelectField, Switch, TextArea, TextField } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { LoadingBlock } from '@/ui/Spinner';
import { Segmented } from '@/ui/Tabs';
import { useToast } from '@/ui/Toast';

const UTIL: { value: UtilityResponsibility; label: string }[] = [
  { value: 'tenant', label: 'Tenant pays the provider' },
  { value: 'prepaid_tenant', label: 'Prepaid meter (tenant buys)' },
  { value: 'landlord', label: 'Landlord pays (included)' },
  { value: 'shared', label: 'Landlord pays, recovers from tenant' },
  { value: 'not_applicable', label: 'Not applicable' },
];

export function TenancyFormPage() {
  const { pid, tid } = useParams();
  const { user } = useAuthed();
  const prop = useProperty(pid);
  const ten = useTenancy(pid, tid);
  if (prop.loading || (tid && ten.loading)) return <LoadingBlock />;
  if (!prop.data || !capsFor(prop.data, user.uid).manage) return <ErrorNote>You can’t edit tenancies on this property.</ErrorNote>;
  return <TenancyForm key={tid ?? 'new'} pid={prop.data.id} propertyName={prop.data.name} marketId={prop.data.marketId} currency={prop.data.currency} existing={ten.data ?? undefined} />;
}

function TenancyForm({ pid, propertyName, marketId, currency, existing }: { pid: string; propertyName: string; marketId: string; currency: string; existing?: Tenancy }) {
  const { actor } = useAuthed();
  const nav = useNavigate();
  const toast = useToast();
  const market = getMarket(marketId);
  const today = todayIn(market.timeZone);
  const [f, setF] = useState<Partial<Tenancy>>(
    existing ?? {
      tenantName: '',
      startDate: today,
      endDate: addDays(addMonths(today, 12), -1),
      dueDay: 1,
      prorate: true,
      escalation: { kind: 'percent', percent: 8, intervalMonths: 12 },
      utilities: { electricity: 'prepaid_tenant', water: 'shared' },
      additionalCharges: [],
      currency,
    },
  );
  const [fixedTerm, setFixedTerm] = useState(Boolean(existing ? existing.endDate : true));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Tenancy>(k: K, v: Tenancy[K] | undefined) => setF((x) => ({ ...x, [k]: v }));
  const data = { ...f, endDate: fixedTerm ? f.endDate || undefined : undefined };
  const v = validateTenancy(data);
  const e = (k: keyof typeof v.errors) => (touched ? v.errors[k] : undefined);
  const esc = f.escalation ?? { kind: 'none' };

  const save = async () => {
    setTouched(true);
    if (!v.ok) return;
    setBusy(true);
    setError('');
    const input: TenancyInput = {
      tenantName: f.tenantName!.trim(),
      tenantEmail: f.tenantEmail?.trim() || undefined,
      landlordName: f.landlordName?.trim() || undefined,
      startDate: f.startDate!,
      endDate: data.endDate,
      monthlyRent: f.monthlyRent!,
      currency,
      dueDay: f.dueDay!,
      prorate: f.prorate ?? true,
      escalation: esc,
      depositAmount: f.depositAmount,
      depositPaidDate: f.depositPaidDate || undefined,
      depositTerms: f.depositTerms?.trim() || undefined,
      depositHeldBy: f.depositHeldBy?.trim() || undefined,
      utilities: f.utilities ?? { electricity: 'tenant', water: 'tenant' },
      parking: f.parking?.trim() || undefined,
      additionalCharges: f.additionalCharges ?? [],
      managingAgent: f.managingAgent?.trim() || undefined,
      notes: f.notes?.trim() || undefined,
    };
    try {
      const id = await saveTenancy(pid, existing?.id ?? null, input, actor);
      toast(existing ? 'Tenancy saved' : 'Tenancy added');
      nav(`/properties/${pid}/tenancies/${id}`, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <div className="animate-rise mx-auto max-w-3xl">
      <PageHeader eyebrow={propertyName} title={existing ? 'Edit tenancy' : 'Add a tenancy'} back={{ to: existing ? `/properties/${pid}/tenancies/${existing.id}` : `/properties/${pid}?tab=tenancies`, label: existing ? 'Tenancy' : propertyName }} />
      <div className="space-y-6">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink">People</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Tenant name" value={f.tenantName ?? ''} onChange={(x) => set('tenantName', x)} error={e('tenantName')} />
            <TextField label="Tenant email" optional type="email" value={f.tenantEmail ?? ''} onChange={(x) => set('tenantEmail', x)} hint="For your records. It doesn’t invite them." />
            <TextField label="Landlord name" optional value={f.landlordName ?? ''} onChange={(x) => set('landlordName', x)} />
            <TextField label="Managing agent" optional value={f.managingAgent ?? ''} onChange={(x) => set('managingAgent', x)} />
          </div>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-ink">Lease term</h2>
            <Segmented label="Lease type" value={fixedTerm ? 'fixed' : 'open'} onChange={(x) => setFixedTerm(x === 'fixed')} options={[{ value: 'fixed', label: 'Fixed term' }, { value: 'open', label: 'Month to month' }]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Start date" type="date" value={f.startDate ?? ''} onChange={(x) => set('startDate', x)} error={e('startDate')} />
            {fixedTerm && <TextField label="End date" type="date" value={f.endDate ?? ''} onChange={(x) => set('endDate', x)} error={e('endDate')} />}
          </div>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink">Rent</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField label="Monthly rent" value={f.monthlyRent} onChange={(x) => set('monthlyRent', x)} currency={currency} locale={market.locale} error={e('monthlyRent')} />
            <TextField label="Rent due on day" type="number" min={1} max={31} inputMode="numeric" value={String(f.dueDay ?? '')} onChange={(x) => set('dueDay', Number(x) || undefined)} error={e('dueDay')} hint="Day of the month. 31 means the last day." />
          </div>
          <Switch checked={f.prorate ?? true} onChange={(x) => set('prorate', x)} label="Pro-rata partial months" description="Charge by days when the lease starts or ends mid-month." />
          <div className="border-t border-line pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink-2">Escalation</h3>
              <Segmented
                label="Escalation type"
                size="sm"
                value={esc.kind}
                onChange={(k) => set('escalation', k === 'none' ? { kind: 'none' } : k === 'percent' ? { kind: 'percent', percent: 8, intervalMonths: 12 } : { kind: 'steps', steps: [] })}
                options={[{ value: 'none', label: 'None' }, { value: 'percent', label: 'Percentage' }, { value: 'steps', label: 'Fixed amounts' }]}
              />
            </div>
            {esc.kind === 'percent' && (
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField label="Increase (%)" type="number" step="0.1" inputMode="decimal" value={String(esc.percent)} onChange={(x) => set('escalation', { ...esc, percent: Number(x) })} error={e('escalation')} />
                <TextField label="Every (months)" type="number" inputMode="numeric" value={String(esc.intervalMonths)} onChange={(x) => set('escalation', { ...esc, intervalMonths: Number(x) })} />
                <TextField label="First increase on" optional type="date" value={esc.firstEffective ?? ''} onChange={(x) => set('escalation', { ...esc, firstEffective: x || undefined } as Escalation)} hint="Defaults to the anniversary." />
              </div>
            )}
            {esc.kind === 'steps' && (
              <div className="space-y-3">
                {esc.steps.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                    <TextField label="From" type="date" value={s.effectiveFrom} onChange={(x) => set('escalation', { kind: 'steps', steps: esc.steps.map((y, j) => (j === i ? { ...y, effectiveFrom: x } : y)) })} />
                    <MoneyField label="New monthly rent" value={s.amount} onChange={(x) => set('escalation', { kind: 'steps', steps: esc.steps.map((y, j) => (j === i ? { ...y, amount: x ?? 0 } : y)) })} currency={currency} locale={market.locale} />
                    <Button variant="ghost" onClick={() => set('escalation', { kind: 'steps', steps: esc.steps.filter((_, j) => j !== i) })}>
                      Remove
                    </Button>
                  </div>
                ))}
                {e('escalation') && <p className="text-xs text-bad">{e('escalation')}</p>}
                <Button variant="soft" size="sm" onClick={() => set('escalation', { kind: 'steps', steps: [...esc.steps, { effectiveFrom: addMonths(f.startDate ?? today, 12), amount: f.monthlyRent ?? 0 }] })}>
                  Add step
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-3 border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-ink-2">Additional monthly charges</h3>
            {(f.additionalCharges ?? []).map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                <TextField label="Charge" value={c.label} onChange={(x) => set('additionalCharges', f.additionalCharges!.map((y, j) => (j === i ? { ...y, label: x } : y)))} />
                <MoneyField label="Amount" value={c.amount} onChange={(x) => set('additionalCharges', f.additionalCharges!.map((y, j) => (j === i ? { ...y, amount: x ?? 0 } : y)))} currency={currency} locale={market.locale} />
                <Button variant="ghost" onClick={() => set('additionalCharges', f.additionalCharges!.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            <Button variant="soft" size="sm" onClick={() => set('additionalCharges', [...(f.additionalCharges ?? []), { label: 'Parking', amount: 0 }])}>
              Add charge
            </Button>
          </div>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink">Deposit, utilities and parking</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField label="Deposit" optional value={f.depositAmount} onChange={(x) => set('depositAmount', x)} currency={currency} locale={market.locale} />
            <TextField label="Deposit paid on" optional type="date" value={f.depositPaidDate ?? ''} onChange={(x) => set('depositPaidDate', x)} />
            <TextField label="Deposit held by" optional value={f.depositHeldBy ?? ''} onChange={(x) => set('depositHeldBy', x)} hint="E.g. agent’s trust account, interest-bearing account." />
          </div>
          <TextArea label="Deposit terms" optional value={f.depositTerms ?? ''} onChange={(x) => set('depositTerms', x)} rows={2} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Electricity" value={f.utilities?.electricity ?? 'tenant'} onChange={(x) => set('utilities', { ...(f.utilities ?? { water: 'tenant' }), electricity: x })} options={UTIL} />
            <SelectField label="Water" value={f.utilities?.water ?? 'tenant'} onChange={(x) => set('utilities', { ...(f.utilities ?? { electricity: 'tenant' }), water: x })} options={UTIL} />
          </div>
          <TextField label="Parking" optional value={f.parking ?? ''} onChange={(x) => set('parking', x)} placeholder="Bay 14, covered" />
          <TextArea label="Notes" optional value={f.notes ?? ''} onChange={(x) => set('notes', x)} rows={2} />
        </Card>

        {touched && !v.ok && <ErrorNote>Some details need attention. Check the highlighted fields.</ErrorNote>}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => nav(-1)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            {existing ? 'Save tenancy' : 'Add tenancy'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TenancyPage() {
  const { pid, tid } = useParams();
  const { user } = useAuthed();
  const prop = useProperty(pid);
  const ten = useTenancy(pid, tid);
  const [showAll, setShowAll] = useState(false);
  if (prop.loading || ten.loading) return <LoadingBlock />;
  if (!ten.data) return <ErrorNote>This tenancy isn’t available to you.</ErrorNote>;
  const t = ten.data;
  const p = prop.data;
  const caps = capsFor(p, user.uid);
  const market = getMarket(p?.marketId);
  const today = todayIn(market.timeZone);
  const status = leaseStatus(t, today);
  const schedule = rentSchedule(t, { until: t.endDate ? undefined : addMonths(today, 12) });
  const nowIdx = Math.max(0, schedule.findIndex((s) => s.to >= today));
  const visible = showAll ? schedule : schedule.slice(Math.max(0, nowIdx - 1), nowIdx + 11);
  const next = nextEscalation(t, today);
  const money = (v: number) => fmtMoney(v, t.currency, market);
  const total = schedule.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: `/properties/${pid}?tab=tenancies`, label: p?.name ?? 'Property' }}
        eyebrow="Tenancy"
        title={t.tenantName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {fmtDate(t.startDate, market)} – {t.endDate ? fmtDate(t.endDate, market) : 'month to month'}
            <Badge tone={status === 'ended' ? 'neutral' : status === 'upcoming' ? 'info' : 'good'}>{LEASE_STATUS_LABELS[status]}</Badge>
            {t.partyIds.length > 0 && <Badge tone="accent" icon={<Link2 className="size-3" />}>Linked to {t.partyIds.length} account{t.partyIds.length > 1 ? 's' : ''}</Badge>}
          </span>
        }
        actions={
          <>
            {caps.inspect && (
              <ButtonLink to={`/properties/${pid}/inspections/new?tenancy=${t.id}&type=${status === 'ended' ? 'outgoing' : 'ingoing'}`} variant="secondary" icon={<ClipboardCheck className="size-4" />}>
                Inspect
              </ButtonLink>
            )}
            {caps.manage && (
              <ButtonLink to={`/properties/${pid}/tenancies/${t.id}/edit`} variant="secondary" icon={<Pencil className="size-4" />}>
                Edit
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Current rent</div>
            <div className="mt-1 font-display text-3xl font-semibold text-ink tabular-nums">{money(rateOn(t, today).rate)}</div>
            <div className="mt-1 text-sm text-ink-3">per month, due on day {t.dueDay}</div>
            {next && (
              <div className="mt-4 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info-ink">
                Next escalation {fmtDate(next, market)}: {money(rateOn(t, next).rate)}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Item label="Deposit" value={t.depositAmount != null ? money(t.depositAmount) : '—'} sub={t.depositPaidDate ? `Paid ${fmtDate(t.depositPaidDate, market)}` : undefined} />
              <Item label="Held by" value={t.depositHeldBy || '—'} />
              <Item label="Electricity" value={UTIL.find((u) => u.value === t.utilities.electricity)?.label ?? '—'} />
              <Item label="Water" value={UTIL.find((u) => u.value === t.utilities.water)?.label ?? '—'} />
              <Item label="Parking" value={t.parking || '—'} />
              <Item label="Agent" value={t.managingAgent || '—'} />
              {t.additionalCharges.map((c, i) => (
                <Item key={i} label={c.label} value={`${money(c.amount)}/month`} />
              ))}
            </dl>
            {t.depositTerms && <p className="mt-4 border-t border-line pt-4 text-sm whitespace-pre-wrap text-ink-2">{t.depositTerms}</p>}
          </Card>
        </div>

        <Card>
          <CardHeader title="Rent schedule" subtitle={`${schedule.length} periods · ${money(total)} over ${t.endDate ? 'the lease' : 'the next 12 months'}`} icon={<CalendarDays className="size-5" />} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-ink-3">
                  <th className="px-5 py-2">Period</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-5 py-2 text-right">Amount due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((s) => (
                  <tr key={s.period} className={s.from <= today && s.to >= today ? 'bg-accent-soft/50' : undefined}>
                    <td className="px-5 py-2.5 text-ink">
                      {new Intl.DateTimeFormat(market.locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${s.period}-01T00:00:00Z`))}
                      <div className="flex gap-1.5">
                        {s.prorated && <span className="text-xs text-ink-3">pro rata from {s.from.slice(8)}</span>}
                        {s.escalationsApplied > 0 && s.rate !== t.monthlyRent && <span className="text-xs text-info">+{s.escalationsApplied} escalation{s.escalationsApplied > 1 ? 's' : ''}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{fmtDate(s.dueDate, market)}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-ink tabular-nums">{money(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-5">
            {schedule.length > visible.length && (
              <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                Show all {schedule.length} periods
              </Button>
            )}
            <InfoNote icon={<Info className="size-4" />}>
              This is rent due under the lease, calculated from the terms above. It isn’t a record of payments. Periods are calendar months; an escalation applies from the first month that starts on or after its date{t.prorate ? '; partial months are charged by days' : ''}. Payment tracking and the ledger come in a later phase.
            </InfoNote>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Item({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
      {sub && <dd className="text-xs text-ink-3">{sub}</dd>}
    </div>
  );
}
