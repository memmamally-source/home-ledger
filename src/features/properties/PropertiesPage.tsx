import { Building2, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { todayIn } from '@/domain/dates';
import { currentTenancies } from '@/domain/portfolio';
import { formatAddress, type Property } from '@/domain/property';
import { ROLE_LABELS, TEAM_ROLES } from '@/domain/roles';
import { useTeamTenancies } from '@/data/portfolio';
import { useMyProperties } from '@/data/properties';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { PropertyCard } from '@/features/home/HomePage';
import { ButtonLink } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState, ErrorNote } from '@/ui/EmptyState';
import { inputClass, SelectField } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { LoadingBlock } from '@/ui/Spinner';
import { Segmented } from '@/ui/Tabs';

type Kind = 'all' | 'landlord' | 'tenant';
type Occ = 'any' | 'occupied' | 'vacant';

export function PropertiesPage() {
  const { user, market } = useAuthed();
  const props = useMyProperties(user.uid);
  const [kind, setKind] = useState<Kind>('all');
  const [occ, setOcc] = useState<Occ>('any');
  const [group, setGroup] = useState('');
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);

  const isTeam = (p: Property) => p.ownerUid === user.uid || TEAM_ROLES.includes(p.members[user.uid]?.role ?? 'tenant');
  const teamIds = props.data.filter((p) => p.recordKind === 'landlord' && isTeam(p)).map((p) => p.id);
  const tenancies = useTeamTenancies(teamIds);
  const today = todayIn(market.timeZone);
  const occupied = (p: Property) => (tenancies.map.has(p.id) ? currentTenancies(tenancies.map.get(p.id)!, today).length > 0 : undefined);

  const groups = [...new Set(props.data.flatMap((p) => [p.portfolio, p.buildingName]).filter(Boolean) as string[])].sort();
  const needle = q.trim().toLowerCase();
  const list = props.data
    .filter((p) => p.archived === archived)
    .filter((p) => kind === 'all' || (kind === 'landlord' ? p.recordKind === 'landlord' && isTeam(p) : !(p.recordKind === 'landlord' && isTeam(p))))
    .filter((p) => occ === 'any' || occupied(p) === (occ === 'occupied'))
    .filter((p) => !group || p.portfolio === group || p.buildingName === group)
    .filter((p) => !needle || `${p.name} ${formatAddress(p.address, p.unitNumber)}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="animate-rise">
      <PageHeader title="Properties" subtitle="Everything you own, manage or rent." actions={<ButtonLink to="/properties/new" icon={<Plus className="size-4" />}>Add property</ButtonLink>} />
      {props.error && <ErrorNote>{friendlyError(props.error)}</ErrorNote>}
      {props.loading ? (
        <LoadingBlock />
      ) : props.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 className="size-6" />} title="No properties yet" action={<ButtonLink to="/properties/new" icon={<Plus className="size-4" />}>Add your first property</ButtonLink>}>
            Add a property you own or manage, or the home you rent. If someone invited you, open the link they sent.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
              <input className={`${inputClass} pl-10`} placeholder="Search by name or address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search properties" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Record type" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'landlord', label: 'I manage' }, { value: 'tenant', label: 'I rent' }]} />
              <Segmented label="Occupancy" value={occ} onChange={setOcc} options={[{ value: 'any', label: 'Any' }, { value: 'occupied', label: 'Occupied' }, { value: 'vacant', label: 'Vacant' }]} />
            </div>
            {groups.length > 0 && <SelectField className="lg:w-56" label="Portfolio or building" value={group} onChange={setGroup} options={[{ value: '', label: 'All' }, ...groups.map((g) => ({ value: g, label: g }))]} />}
          </div>
          {list.length === 0 ? (
            <Card>
              <EmptyState icon={<Search className="size-6" />} title="Nothing matches these filters">Try clearing the search or filters.</EmptyState>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <PropertyCard key={p.id} p={p} occupied={occupied(p)} roleLabel={p.ownerUid === user.uid ? undefined : ROLE_LABELS[p.members[user.uid]?.role ?? 'tenant']} />
              ))}
            </div>
          )}
          <button type="button" className="mt-6 text-sm font-semibold text-ink-3 hover:text-ink" onClick={() => setArchived(!archived)}>
            {archived ? 'Show active properties' : 'Show archived properties'}
          </button>
        </>
      )}
    </div>
  );
}
