import { Archive, ClipboardCheck, Copy, KeyRound, Lock, LogOut, Mail, Pencil, Plus, Share2, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { getMarket } from '@/config/markets';
import { AUDIT_KIND_LABELS } from '@/domain/audit';
import { todayIn } from '@/domain/dates';
import { inspectionProgress } from '@/domain/inspection/logic';
import { INSPECTION_TYPE_LABELS, type Inspection } from '@/domain/inspection/types';
import { inviteLink, isValidEmail } from '@/domain/invitation';
import { formatAddress, PROPERTY_TYPE_LABELS, type Property } from '@/domain/property';
import { INVITABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type PropertyRole } from '@/domain/roles';
import { LEASE_STATUS_LABELS, leaseStatus, rateOn, type Tenancy } from '@/domain/tenancy';
import { useAudit } from '@/data/audit';
import { usePropertyInspections } from '@/data/inspections';
import { createInvitation, revokeInvitation, usePropertyInvitations } from '@/data/invitations';
import { capsFor, leaveProperty, removeMember, setArchived, usePrivateDetails, useProperty } from '@/data/properties';
import { useTenancies } from '@/data/tenancies';
import { fmtDate, fmtInstant, fmtMoney, initials } from '@/lib/format';
import { friendlyError, toDate } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { Badge, type Tone } from '@/ui/Badge';
import { Button, ButtonLink } from '@/ui/Button';
import { Card, CardHeader } from '@/ui/Card';
import { Dialog } from '@/ui/Dialog';
import { EmptyState, ErrorNote, InfoNote } from '@/ui/EmptyState';
import { SelectField, TextArea, TextField } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { ProgressRing } from '@/ui/Progress';
import { LoadingBlock } from '@/ui/Spinner';
import { Tabs } from '@/ui/Tabs';
import { useToast } from '@/ui/Toast';

type Tab = 'overview' | 'tenancies' | 'inspections' | 'people' | 'activity';

export function PropertyPage() {
  const { pid } = useParams();
  const { user } = useAuthed();
  const [params, setParams] = useSearchParams();
  const prop = useProperty(pid);
  const caps = capsFor(prop.data, user.uid);
  const tenancies = useTenancies(pid, user.uid, caps.manage);
  const inspections = usePropertyInspections(pid, user.uid, caps.manage);
  const tab = (params.get('tab') as Tab) || 'overview';

  if (prop.loading) return <LoadingBlock />;
  if (!prop.data)
    return (
      <Card>
        <EmptyState icon={<Lock className="size-6" />} title="This property isn’t available" action={<ButtonLink to="/properties" variant="secondary">Back to properties</ButtonLink>}>
          It may have been removed, or you no longer have access. Inspections you took part in are still listed under Inspections.
        </EmptyState>
      </Card>
    );
  const p = prop.data;
  const role = p.members[user.uid]?.role;
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'tenancies', label: 'Tenancies', count: tenancies.data.length },
    { value: 'inspections', label: 'Inspections', count: inspections.data.length },
    { value: 'people', label: 'People', count: p.memberIds.length },
    ...(caps.manage ? [{ value: 'activity' as const, label: 'Activity' }] : []),
  ];

  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: '/properties', label: 'Properties' }}
        eyebrow={p.recordKind === 'tenant' ? (p.ownerUid === user.uid ? 'My rented home' : 'A tenant’s record') : PROPERTY_TYPE_LABELS[p.type]}
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {formatAddress(p.address, p.unitNumber)}
            {role && <Badge tone="info">{p.ownerUid === user.uid ? 'Record owner' : ROLE_LABELS[role]}</Badge>}
            {p.archived && <Badge>Archived</Badge>}
          </span>
        }
        actions={
          <>
            {caps.inspect && (
              <ButtonLink to={`/properties/${p.id}/inspections/new`} icon={<ClipboardCheck className="size-4" />}>
                New inspection
              </ButtonLink>
            )}
            {caps.manage && (
              <ButtonLink to={`/properties/${p.id}/edit`} variant="secondary" icon={<Pencil className="size-4" />}>
                Edit
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="mb-6">
        <Tabs label="Property sections" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={tabs} />
      </div>
      {tab === 'overview' && <Overview p={p} tenancies={tenancies.data} inspections={inspections.data} />}
      {tab === 'tenancies' && <TenancyList p={p} tenancies={tenancies.data} loading={tenancies.loading} />}
      {tab === 'inspections' && <InspectionList p={p} inspections={inspections.data} loading={inspections.loading} />}
      {tab === 'people' && <People p={p} tenancies={tenancies.data} />}
      {tab === 'activity' && caps.manage && <Activity p={p} />}
    </div>
  );
}

function Overview({ p, tenancies, inspections }: { p: Property; tenancies: Tenancy[]; inspections: Inspection[] }) {
  const { user } = useAuthed();
  const caps = capsFor(p, user.uid);
  const market = getMarket(p.marketId);
  const priv = usePrivateDetails(p.id, caps.finance);
  const today = todayIn(market.timeZone);
  const current = tenancies.filter((t) => ['active', 'month_to_month'].includes(leaseStatus(t, today)));
  const latest = [...inspections].sort((a, b) => (b.inspectionDate > a.inspectionDate ? 1 : -1))[0];
  const d = priv.data;
  const m = (v?: number) => (v == null ? '—' : fmtMoney(v, p.currency, market));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="pb-5">
        <CardHeader title="Tenancy" icon={<KeyRound className="size-5" />} action={caps.manage && <ButtonLink to={`/properties/${p.id}/tenancies/new`} variant="ghost" size="sm" icon={<Plus className="size-4" />}>Add</ButtonLink>} />
        <div className="mt-4 px-5">
          {current.length === 0 ? (
            <p className="text-sm text-ink-3">{tenancies.length ? 'No lease is active today.' : caps.manage ? 'No tenancy recorded yet. Add the lease to get the rent schedule and reminders.' : 'No tenancy has been shared with you yet.'}</p>
          ) : (
            current.map((t) => (
              <Link key={t.id} to={`/properties/${p.id}/tenancies/${t.id}`} className="block rounded-xl bg-surface-2/70 p-4 hover:bg-surface-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{t.tenantName}</span>
                  <Badge tone="good">{LEASE_STATUS_LABELS[leaseStatus(t, today)]}</Badge>
                </div>
                <div className="mt-1 text-sm text-ink-3">
                  {fmtMoney(rateOn(t, today).rate, t.currency, market)} a month · until {t.endDate ? fmtDate(t.endDate, market) : 'further notice'}
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>

      <Card className="pb-5">
        <CardHeader title="Latest inspection" icon={<ClipboardCheck className="size-5" />} />
        <div className="mt-4 px-5">
          {latest ? <InspectionRow i={latest} /> : <p className="text-sm text-ink-3">No inspections yet. An ingoing inspection with photos is the best protection for both sides.</p>}
        </div>
      </Card>

      {caps.finance && p.recordKind === 'landlord' && (
        <Card className="pb-5 lg:col-span-2">
          <CardHeader title="Ownership and finance" subtitle="Private to you and your team" icon={<Lock className="size-5" />} action={<ButtonLink to={`/properties/${p.id}/edit`} variant="ghost" size="sm">Edit</ButtonLink>} />
          {priv.loading ? (
            <LoadingBlock />
          ) : (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 px-5 text-sm sm:grid-cols-4">
              <Fact label="Legal owner" value={d?.ownershipEntity || '—'} />
              <Fact label="Purchase price" value={m(d?.purchasePrice)} sub={d?.purchaseDate ? fmtDate(d.purchaseDate, market) : undefined} />
              <Fact label="Estimated value" value={m(d?.estimatedMarketValue)} sub={d?.estimatedMarketValue != null ? 'Your estimate, not audited' : undefined} />
              <Fact label={`${market.terms.bond} balance`} value={m(d?.bondBalance)} sub={d?.bondLender} />
              <Fact
                label="Estimated equity"
                value={d?.estimatedMarketValue != null ? m(d.estimatedMarketValue - (d.bondBalance ?? 0)) : '—'}
                sub={d?.estimatedMarketValue != null ? `Estimated value − ${market.terms.bond.toLowerCase()}` : 'Add an estimated value'}
              />
              <Fact label={market.terms.rates} value={m(d?.ratesMonthly)} sub="per month" />
              <Fact label={market.terms.levies} value={m(d?.leviesMonthly)} sub="per month" />
              <Fact label="Insurance" value={m(d?.insuranceMonthly)} sub={d?.insuranceRenewalDate ? `Renews ${fmtDate(d.insuranceRenewalDate, market)}` : d?.insurer} />
            </dl>
          )}
        </Card>
      )}

      {p.notes && (
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold text-ink">Notes</h2>
          <p className="mt-2 text-sm whitespace-pre-wrap text-ink-2">{p.notes}</p>
        </Card>
      )}
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-ink-3">{sub}</dd>}
    </div>
  );
}

function TenancyList({ p, tenancies, loading }: { p: Property; tenancies: Tenancy[]; loading: boolean }) {
  const { user } = useAuthed();
  const caps = capsFor(p, user.uid);
  const market = getMarket(p.marketId);
  const today = todayIn(market.timeZone);
  if (loading) return <LoadingBlock />;
  return (
    <Card>
      {tenancies.length === 0 ? (
        <EmptyState icon={<KeyRound className="size-6" />} title="No tenancies yet" action={caps.manage && <ButtonLink to={`/properties/${p.id}/tenancies/new`} icon={<Plus className="size-4" />}>Add tenancy</ButtonLink>}>
          {caps.manage ? 'Record the lease: rent, escalation, deposit and dates. The tenant doesn’t need an account.' : 'When your landlord links you to a tenancy, it appears here.'}
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {[...tenancies]
              .sort((a, b) => (b.startDate > a.startDate ? 1 : -1))
              .map((t) => {
                const s = leaseStatus(t, today);
                return (
                  <li key={t.id}>
                    <Link to={`/properties/${p.id}/tenancies/${t.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2/60">
                      <div className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-ink-2">{initials(t.tenantName)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-ink">{t.tenantName}</div>
                        <div className="text-sm text-ink-3">
                          {fmtDate(t.startDate, market)} – {t.endDate ? fmtDate(t.endDate, market) : 'month to month'} · {fmtMoney(rateOn(t, today).rate, t.currency, market)}/month
                        </div>
                      </div>
                      <Badge tone={s === 'ended' ? 'neutral' : s === 'upcoming' ? 'info' : 'good'}>{LEASE_STATUS_LABELS[s]}</Badge>
                    </Link>
                  </li>
                );
              })}
          </ul>
          {caps.manage && (
            <div className="border-t border-line p-4">
              <ButtonLink to={`/properties/${p.id}/tenancies/new`} variant="ghost" size="sm" icon={<Plus className="size-4" />}>
                Add tenancy
              </ButtonLink>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export const INSPECTION_STATUS: Record<Inspection['status'], { label: string; tone: Tone }> = {
  draft: { label: 'In progress', tone: 'warn' },
  completed: { label: 'Completed', tone: 'good' },
  void: { label: 'Voided', tone: 'neutral' },
};

export function InspectionRow({ i }: { i: Inspection }) {
  const { market } = useAuthed();
  const pr = inspectionProgress(i.rooms);
  return (
    <Link to={`/properties/${i.propertyId}/inspections/${i.id}`} className="flex items-center gap-4 rounded-xl px-1 py-1 hover:bg-surface-2/60">
      <ProgressRing value={pr.percent} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-ink">{i.title}</div>
        <div className="truncate text-sm text-ink-3">
          {INSPECTION_TYPE_LABELS[i.type]} · {fmtDate(i.inspectionDate, market)} · {pr.defective} defect{pr.defective === 1 ? '' : 's'}
        </div>
      </div>
      <Badge tone={INSPECTION_STATUS[i.status].tone}>{INSPECTION_STATUS[i.status].label}</Badge>
    </Link>
  );
}

function InspectionList({ p, inspections, loading }: { p: Property; inspections: Inspection[]; loading: boolean }) {
  const { user } = useAuthed();
  const caps = capsFor(p, user.uid);
  if (loading) return <LoadingBlock />;
  return (
    <Card className="p-4">
      {inspections.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="size-6" />} title="No inspections yet" action={caps.inspect && <ButtonLink to={`/properties/${p.id}/inspections/new`} icon={<Plus className="size-4" />}>Start an inspection</ButtonLink>}>
          Go room by room, mark each item and take photos. Nothing unchecked is ever assumed to be fine.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {[...inspections]
            .sort((a, b) => (b.inspectionDate > a.inspectionDate ? 1 : -1))
            .map((i) => (
              <InspectionRow key={i.id} i={i} />
            ))}
        </div>
      )}
    </Card>
  );
}

function People({ p, tenancies }: { p: Property; tenancies: Tenancy[] }) {
  const { user, actor } = useAuthed();
  const nav = useNavigate();
  const toast = useToast();
  const caps = capsFor(p, user.uid);
  const invites = usePropertyInvitations(caps.manage ? p.id : undefined, user.uid);
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: 'remove'; uid: string } | { kind: 'leave' } | { kind: 'archive' }>(null);
  const [busy, setBusy] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const pending = invites.data.filter((i) => i.status === 'pending' && (toDate(i.expiresAt)?.getTime() ?? 0) > openedAt);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      setConfirm(null);
    } catch (e) {
      toast(friendlyError(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="People on this property" subtitle="Each person’s access depends on their role here." icon={<Users className="size-5" />} action={caps.manage && <Button size="sm" variant="soft" icon={<UserPlus className="size-4" />} onClick={() => setInviting(true)}>Invite</Button>} />
        <ul className="mt-3 divide-y divide-line">
          {p.memberIds.map((id) => {
            const m = p.members[id];
            if (!m) return null;
            return (
              <li key={id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-ink">{initials(m.displayName)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">
                    {m.displayName} {id === user.uid && <span className="font-normal text-ink-3">(you)</span>}
                  </div>
                  <div className="text-sm text-ink-3">{p.ownerUid === id ? 'Record owner' : ROLE_LABELS[m.role]}</div>
                </div>
                {p.ownerUid === user.uid && id !== user.uid && (
                  <Button variant="ghost" size="sm" aria-label={`Remove ${m.displayName}`} onClick={() => setConfirm({ kind: 'remove', uid: id })} icon={<Trash2 className="size-4" />} />
                )}
              </li>
            );
          })}
        </ul>
        {p.memberIds.length === 1 && caps.manage && (
          <div className="px-5 pb-5">
            <InfoNote tone="accent">
              {p.recordKind === 'landlord'
                ? 'You can manage this property on your own. Invite a tenant only if you want to share inspections and the tenancy with them.'
                : 'This is your own record. Invite your landlord or agent only if you want to share inspections with them. They will not see your private notes.'}
            </InfoNote>
          </div>
        )}
      </Card>

      {caps.manage && pending.length > 0 && (
        <Card>
          <CardHeader title="Pending invitations" icon={<Mail className="size-5" />} />
          <ul className="mt-3 divide-y divide-line">
            {pending.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{ROLE_LABELS[inv.role]}</div>
                  <div className="text-sm text-ink-3">{inv.email ? `Only ${inv.email} can accept` : 'Anyone with the link can accept'} · expires {toDate(inv.expiresAt)?.toLocaleDateString()}</div>
                </div>
                <Button variant="secondary" size="sm" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard.writeText(inviteLink(location.href, inv.id)).then(() => toast('Link copied'))}>
                  Copy link
                </Button>
                <Button variant="ghost" size="sm" onClick={() => run(() => revokeInvitation(inv, actor), 'Invitation cancelled')}>
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {p.ownerUid !== user.uid && (
          <Button variant="danger" icon={<LogOut className="size-4" />} onClick={() => setConfirm({ kind: 'leave' })}>
            Leave this property
          </Button>
        )}
        {p.ownerUid === user.uid && (
          <Button variant="secondary" icon={<Archive className="size-4" />} onClick={() => (p.archived ? run(() => setArchived(p.id, false, actor), 'Property restored') : setConfirm({ kind: 'archive' }))}>
            {p.archived ? 'Restore property' : 'Archive property'}
          </Button>
        )}
      </div>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} p={p} tenancies={tenancies} />

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'leave' ? 'Leave this property?' : confirm?.kind === 'archive' ? 'Archive this property?' : 'Remove this person?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Keep
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                if (confirm?.kind === 'leave') void run(() => leaveProperty(p, actor), 'You left the property').then(() => nav('/properties'));
                else if (confirm?.kind === 'archive') void run(() => setArchived(p.id, true, actor), 'Property archived');
                else if (confirm?.kind === 'remove') void run(() => removeMember(p, confirm.uid, actor), 'Removed');
              }}
            >
              {confirm?.kind === 'leave' ? 'Leave' : confirm?.kind === 'archive' ? 'Archive' : 'Remove'}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-2">
          {confirm?.kind === 'archive'
            ? 'It will be hidden from your lists and dashboard. Nothing is deleted, and you can restore it at any time.'
            : 'Access to the property ends. Inspections the person took part in stay available to them, so nobody loses their own records.'}
        </p>
      </Dialog>
    </div>
  );
}

function InviteDialog({ open, onClose, p, tenancies }: { open: boolean; onClose: () => void; p: Property; tenancies: Tenancy[] }) {
  const { actor } = useAuthed();
  const toast = useToast();
  const roles = INVITABLE_ROLES[p.recordKind];
  const [role, setRole] = useState<PropertyRole>(roles[0] === 'co_owner' ? 'tenant' : roles[0]!);
  const [email, setEmail] = useState('');
  const [tenancyId, setTenancyId] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tenantRole = role === 'tenant' || role === 'co_tenant';

  const close = () => {
    setLink('');
    setEmail('');
    setMessage('');
    setError('');
    onClose();
  };

  const create = async () => {
    if (email && !isValidEmail(email)) return setError('Enter a valid email or leave it empty.');
    setBusy(true);
    setError('');
    try {
      const token = await createInvitation(p, { role, email: email || undefined, tenancyId: tenantRole ? tenancyId || undefined : undefined, message }, actor);
      setLink(inviteLink(location.href, token));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const text = `${actor.name} invited you to ${p.name} on HomeLedger.${message ? `\n\n${message}` : ''}`;
    if (navigator.share) await navigator.share({ title: 'Invitation', text, url: link }).catch(() => undefined);
    else await navigator.clipboard.writeText(`${text}\n${link}`).then(() => toast('Invitation copied'));
  };

  return (
    <Dialog open={open} onClose={close} title={link ? 'Invitation ready' : 'Invite someone'} description={link ? undefined : 'They’ll get access only after they open the link and accept.'}>
      {link ? (
        <div className="space-y-4">
          <InfoNote tone="accent">Send this link yourself (message, email or WhatsApp). The app has not emailed it: email delivery isn’t set up yet. It works once and expires in 14 days.</InfoNote>
          <div className="rounded-xl bg-surface-2 p-3 font-mono text-xs break-all text-ink-2">{link}</div>
          <div className="flex gap-2">
            <Button className="flex-1" icon={<Share2 className="size-4" />} onClick={share}>
              Share
            </Button>
            <Button variant="secondary" className="flex-1" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copied'))}>
              Copy
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <SelectField label="Role" value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} hint={ROLE_DESCRIPTIONS[role]} />
          {tenantRole && tenancies.length > 0 && (
            <SelectField label="Link to tenancy" optional value={tenancyId} onChange={setTenancyId} options={[{ value: '', label: 'No tenancy' }, ...tenancies.map((t) => ({ value: t.id, label: `${t.tenantName} (from ${t.startDate})` }))]} hint="They will see this tenancy’s details, including rent and deposit." />
          )}
          <TextField label="Their email" optional type="email" value={email} onChange={setEmail} hint="Recommended. Only an account with this verified email can accept." />
          <TextArea label="Message" optional value={message} onChange={setMessage} rows={2} />
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button className="w-full" loading={busy} onClick={create}>
            Create invitation link
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function Activity({ p }: { p: Property }) {
  const { user } = useAuthed();
  const market = getMarket(p.marketId);
  const audit = useAudit(p.id, user.uid, true);
  if (audit.loading) return <LoadingBlock />;
  if (audit.error) return <ErrorNote>{friendlyError(audit.error)}</ErrorNote>;
  return (
    <Card>
      <CardHeader title="Activity log" subtitle="Append-only. Times are recorded by the server. Entries cannot be edited or deleted." />
      <ol className="mt-3 divide-y divide-line">
        {audit.data.map((e) => (
          <li key={e.id} className="flex gap-3 px-5 py-3">
            <div className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink">{e.summary}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
                <span>{fmtInstant(e.at, market)}</span>
                <span>{AUDIT_KIND_LABELS[e.kind]}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {audit.data.length === 0 && <p className="px-5 pb-5 text-sm text-ink-3">No activity yet.</p>}
    </Card>
  );
}
