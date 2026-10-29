import { ClipboardCheck, Plus } from 'lucide-react';
import { useUploads } from '@/app/AppShell';
import { useAuthed } from '@/app/session';
import { useMyInspections } from '@/data/inspections';
import { useMyProperties } from '@/data/properties';
import { InspectionRow } from '@/features/properties/PropertyPage';
import { friendlyError } from '@/lib/live';
import { ButtonLink } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState, ErrorNote, InfoNote } from '@/ui/EmptyState';
import { PageHeader, Section } from '@/ui/PageHeader';
import { LoadingBlock } from '@/ui/Spinner';

export function InspectionsPage() {
  const { user } = useAuthed();
  const list = useMyInspections(user.uid);
  const props = useMyProperties(user.uid);
  const uploads = useUploads();
  const memberOf = new Set(props.data.map((p) => p.id));
  const byProperty = new Map<string, typeof list.data>();
  for (const i of [...list.data].sort((a, b) => (b.inspectionDate > a.inspectionDate ? 1 : -1))) byProperty.set(i.propertyId, [...(byProperty.get(i.propertyId) ?? []), i]);

  return (
    <div className="animate-rise">
      <PageHeader title="Inspections" subtitle="Every inspection you took part in, including homes you have moved out of." actions={<ButtonLink to="/properties" icon={<Plus className="size-4" />}>New inspection</ButtonLink>} />
      {uploads.length > 0 && (
        <div className="mb-4">
          <InfoNote tone="warn">{uploads.length} photo{uploads.length === 1 ? ' is' : 's are'} saved on this device and waiting to upload. Keep the app open with a connection to finish.</InfoNote>
        </div>
      )}
      {list.error && <ErrorNote>{friendlyError(list.error)}</ErrorNote>}
      {list.loading ? (
        <LoadingBlock />
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardCheck className="size-6" />} title="No inspections yet" action={<ButtonLink to="/properties">Choose a property</ButtonLink>}>
            Start from a property: open it and choose “New inspection”.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-8">
          {[...byProperty.entries()].map(([pid, items]) => (
            <Section key={pid} title={`${items[0]!.propertyName}${memberOf.has(pid) ? '' : ' · past tenancy'}`}>
              <Card className="space-y-1 p-3">
                {items.map((i) => (
                  <InspectionRow key={i.id} i={i} />
                ))}
              </Card>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
