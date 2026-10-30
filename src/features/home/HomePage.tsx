import { AlertTriangle, ArrowRight, Building2, CalendarClock, ClipboardCheck, ClipboardList, Home, KeyRound, Plus, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { todayIn } from '@/domain/dates';
import { defectsOf, inspectionProgress } from '@/domain/inspection/logic';
import { INSPECTION_TYPE_LABELS, type Inspection } from '@/domain/inspection/types';
import { summarisePortfolio } from '@/domain/portfolio';
import { formatAddress, type Property } from '@/domain/property';
import { ROLE_LABELS, TEAM_ROLES } from '@/domain/roles';
import { useMyInspections } from '@/data/inspections';
import { useTeamTenancies } from '@/data/portfolio';
import { useMyProperties } from '@/data/properties';
import { fmtDate, fmtDays, fmtMoney } from '@/lib/format';
import { useAuthed } from '@/app/session';
import { JoinWithLinkButton } from '@/features/invitations/JoinWithLink';
import { Badge } from '@/ui/Badge';
import { ButtonLink } from '@/ui/Button';
import { Card, CardHeader, Stat } from '@/ui/Card';
import { EmptyState, ErrorNote } from '@/ui/EmptyState';
import { Section } from '@/ui/PageHeader';
import { LoadingBlock } from '@/ui/Spinner';
import { friendlyError } from '@/lib/live';

function greeting(timeZone: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomePage() {
  const { user, profile, market } = useAuthed();
  const props = useMyProperties(user.uid);
  const inspections = useMyInspections(user.uid);

  const isTeamOn = (p: Property) => p.ownerUid === user.uid || TEAM_ROLES.includes(p.members[user.uid]?.role ?? 'tenant');
  const managed = props.data.filter((p) => p.recordKind === 'landlord' && isTeamOn(p));
  const homes = props.data.filter((p) => (p.recordKind === 'tenant' && p.ownerUid === user.uid) || ['tenant', 'co_tenant'].includes(p.members[user.uid]?.role ?? ''));
  const showLandlord = profile.intents.includes('landlord') || managed.length > 0;
  const showTenant = profile.intents.includes('tenant') || homes.length > 0;

  const drafts = inspections.data.filter((i) => i.status === 'draft' && i.editorIds.includes(user.uid));

  return (
    <div className="animate-rise space-y-10">
      <header>
        <p className="text-sm font-semibold text-ink-3">{greeting(market.timeZone)},</p>
        <h1 className="font-display text-[32px] leading-tight font-semibold text-ink">{profile.displayName.split(' ')[0]}</h1>
      </header>

      {props.error && <ErrorNote>{friendlyError(props.error)}</ErrorNote>}
      {props.loading ? (
        <LoadingBlock />
      ) : (
        <>
          {drafts.length > 0 && (
            <Section title="Continue where you left off">
              <div className="grid gap-3 sm:grid-cols-2">
                {drafts.slice(0, 4).map((i) => {
                  const p = inspectionProgress(i.rooms);
                  return (
                    <Link key={i.id} to={`/properties/${i.propertyId}/inspections/${i.id}`} className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent/40">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                        <ClipboardList className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-ink">{i.title}</div>
                        <div className="truncate text-sm text-ink-3">
                          {i.propertyName} · {p.checked} of {p.total} checked
                        </div>
                      </div>
                      <ArrowRight className="size-5 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  );
                })}
              </div>
            </Section>
          )}

          {showLandlord && <LandlordSection properties={managed} />}
          {showTenant && <TenantSection homes={homes} />}
          {!showLandlord && !showTenant && (
            <Card>
              <EmptyState icon={<Home className="size-6" />} title="Let’s set up your first property" action={<ButtonLink to="/properties/new" icon={<Plus className="size-4" />}>Add a property</ButtonLink>}>
                Add a property you own or a home you rent. You can change your roles in Settings.
              </EmptyState>
            </Card>
          )}

          <RecentDefects inspections={inspections.data.filter((i) => i.status === 'completed')} />
        </>
      )}
    </div>
  );

}

function RecentDefects({ inspections: list }: { inspections: Inspection[] }) {
  const rows = list
    .flatMap((i) => defectsOf(i.rooms).filter((d) => d.item.followUp).map((d) => ({ ...d, inspection: i })))
    .slice(0, 6);
  if (rows.length === 0) return null;
  return (
    <Section title="Follow-ups from inspections">
      <Card className="divide-y divide-line">
        {rows.map(({ room, item, inspection }) => (
          <Link key={`${inspection.id}-${item.id}`} to={`/properties/${inspection.propertyId}/inspections/${inspection.id}/rooms/${room.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2/60">
            <AlertTriangle className="size-4 shrink-0 text-bad" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">
                {room.name}: {item.label}
              </div>
              <div className="truncate text-xs text-ink-3">{item.defectDescription || item.comment || inspection.propertyName}</div>
            </div>
            <Badge tone={item.severity === 'urgent' || item.severity === 'major' ? 'bad' : 'warn'}>{item.severity ?? 'minor'}</Badge>
          </Link>
        ))}
      </Card>
    </Section>
  );
}

function LandlordSection({ properties }: { properties: Property[] }) {
  const { market } = useAuthed();
  const today = todayIn(market.timeZone);
  const tenancies = useTeamTenancies(properties.map((p) => p.id));
  const s = summarisePortfolio(properties, tenancies.map, today);
  const rent = Object.entries(s.expectedMonthlyRent);

  return (
    <Section title="Your portfolio" action={<ButtonLink to="/properties/new?kind=landlord" variant="ghost" size="sm" icon={<Plus className="size-4" />}>Add property</ButtonLink>}>
      {properties.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 className="size-6" />} title="Add your first rental property" action={<ButtonLink to="/properties/new?kind=landlord" icon={<Plus className="size-4" />}>Add a property</ButtonLink>}>
            Start with one property. Tenants don’t need to sign up for you to manage tenancies, inspections and records.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Properties" value={s.properties} hint={`${s.occupied} occupied · ${s.vacant} vacant`} />
            <Stat label="Occupancy" value={s.occupancyPercent == null ? '—' : `${s.occupancyPercent}%`} tone={s.occupancyPercent != null && s.occupancyPercent < 80 ? 'warn' : undefined} hint="Based on lease dates" />
            <Stat
              label="Rent due monthly"
              value={rent.length === 0 ? '—' : rent.map(([c, a]) => fmtMoney(a, c, market)).join(' + ')}
              hint="Current lease terms, not money received"
            />
            <Stat label="Leases ending" value={s.expiring.length} tone={s.expiring.length ? 'warn' : undefined} hint="In the next 90 days" />
          </div>

          {(s.expiring.length > 0 || s.escalations.length > 0 || s.upcomingMoveIns.length > 0) && (
            <Card>
              <CardHeader title="Coming up" icon={<CalendarClock className="size-5" />} />
              <ul className="mt-3 divide-y divide-line">
                {s.expiring.map((e) => (
                  <Row key={`x${e.tenancy.id}`} to={`/properties/${e.property.id}/tenancies/${e.tenancy.id}`} icon={<CalendarClock className="size-4 text-warn" />} title={`Lease ends ${fmtDays(e.days)}`} text={`${e.tenancy.tenantName} · ${e.property.name} · ${fmtDate(e.tenancy.endDate, market)}`} />
                ))}
                {s.escalations.map((e) => (
                  <Row key={`e${e.tenancy.id}`} to={`/properties/${e.property.id}/tenancies/${e.tenancy.id}`} icon={<TrendingUp className="size-4 text-info" />} title={`Rent escalates ${fmtDays(e.days)}`} text={`${e.property.name} · new rent ${fmtMoney(e.newRate, e.tenancy.currency, market)} from ${fmtDate(e.date, market)}`} />
                ))}
                {s.upcomingMoveIns.map((e) => (
                  <Row key={`m${e.tenancy.id}`} to={`/properties/${e.property.id}/tenancies/${e.tenancy.id}`} icon={<KeyRound className="size-4 text-accent" />} title={`Move-in ${fmtDays(e.days)}`} text={`${e.tenancy.tenantName} · ${e.property.name}. Plan the ingoing inspection.`} />
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {properties.slice(0, 6).map((p) => (
              <PropertyCard key={p.id} p={p} occupied={(tenancies.map.get(p.id) ?? []).some((t) => t.startDate <= today && (!t.endDate || t.endDate >= today))} />
            ))}
          </div>
          {properties.length > 6 && (
            <Link to="/properties" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
              See all {properties.length} properties <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      )}
    </Section>
  );
}

function Row({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
        <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2">{icon}</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className="truncate text-xs text-ink-3">{text}</div>
        </div>
      </Link>
    </li>
  );
}

export function PropertyCard({ p, occupied, roleLabel }: { p: Property; occupied?: boolean; roleLabel?: string }) {
  return (
    <Link to={`/properties/${p.id}`} className="group block rounded-2xl border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-surface-2 text-ink-2">{p.recordKind === 'tenant' ? <KeyRound className="size-5" /> : <Building2 className="size-5" />}</div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {roleLabel && <Badge tone="info">{roleLabel}</Badge>}
          {p.archived ? <Badge>Archived</Badge> : occupied != null && <Badge tone={occupied ? 'good' : 'warn'}>{occupied ? 'Occupied' : 'Vacant'}</Badge>}
        </div>
      </div>
      <div className="mt-4 font-semibold text-ink group-hover:text-accent">{p.name}</div>
      <div className="mt-0.5 line-clamp-2 text-sm text-ink-3">{formatAddress(p.address, p.unitNumber)}</div>
    </Link>
  );
}

function TenantSection({ homes }: { homes: Property[] }) {
  const { user } = useAuthed();
  return (
    <Section title="Your rented home" action={<ButtonLink to="/properties/new?kind=tenant" variant="ghost" size="sm" icon={<Plus className="size-4" />}>Add a home</ButtonLink>}>
      {homes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<KeyRound className="size-6" />}
            title="Document the home you rent"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink to="/properties/new?kind=tenant" icon={<Plus className="size-4" />}>
                  Add my rented home
                </ButtonLink>
                <JoinWithLinkButton variant="secondary" />
              </div>
            }
          >
            Record your lease, do a move-in inspection with photos, and keep the evidence. Your landlord doesn’t need to use the app. If they invited you, open their link or choose “Join with a link”.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {homes.map((p) => (
            <div key={p.id} className="space-y-2">
              <PropertyCard p={p} roleLabel={p.ownerUid === user.uid ? 'My record' : `${ROLE_LABELS[p.members[user.uid]?.role ?? 'tenant']} · linked`} />
              <div className="flex gap-2">
                <ButtonLink to={`/properties/${p.id}/inspections/new?type=ingoing`} variant="soft" size="sm" icon={<ClipboardCheck className="size-4" />}>
                  {INSPECTION_TYPE_LABELS.ingoing.split(' ')[0]} inspection
                </ButtonLink>
                <ButtonLink to={`/properties/${p.id}?tab=inspections`} variant="ghost" size="sm">
                  View records
                </ButtonLink>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
