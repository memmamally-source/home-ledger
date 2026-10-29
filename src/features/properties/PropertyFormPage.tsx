import { Building2, KeyRound, Lock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { getMarket } from '@/config/markets';
import { PROPERTY_TYPE_LABELS, validateProperty, type Address, type Property, type PropertyPrivateDetails, type PropertyType } from '@/domain/property';
import type { RecordKind } from '@/domain/roles';
import { capsFor, createProperty, savePrivateDetails, updateProperty, usePrivateDetails, useProperty } from '@/data/properties';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ErrorNote, InfoNote } from '@/ui/EmptyState';
import { MoneyField, TextArea, TextField } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { LoadingBlock } from '@/ui/Spinner';
import { useToast } from '@/ui/Toast';
import { cx } from '@/ui/cx';

export function NewPropertyPage() {
  const [params] = useSearchParams();
  const k = params.get('kind');
  const [kind, setKind] = useState<RecordKind | null>(k === 'landlord' || k === 'tenant' ? k : null);
  if (!kind)
    return (
      <div className="animate-rise mx-auto max-w-2xl">
        <PageHeader title="Add a property" back={{ to: '/properties', label: 'Properties' }} subtitle="Whose side are you on for this property?" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { k: 'landlord' as const, icon: Building2, title: 'I own or manage it', text: 'Track the property, tenancies, inspections and private ownership details.' },
            { k: 'tenant' as const, icon: KeyRound, title: 'I rent it', text: 'Keep your own record of the home: lease, inspections and evidence.' },
          ].map((o) => (
            <button key={o.k} type="button" onClick={() => setKind(o.k)} className="rounded-2xl border border-line bg-surface p-6 text-left shadow-card transition-colors hover:border-accent/50">
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <o.icon className="size-5" />
              </div>
              <div className="mt-4 font-semibold text-ink">{o.title}</div>
              <div className="mt-1 text-sm text-ink-3">{o.text}</div>
            </button>
          ))}
        </div>
      </div>
    );
  return <PropertyForm kind={kind} />;
}

export function EditPropertyPage() {
  const { pid } = useParams();
  const { user } = useAuthed();
  const prop = useProperty(pid);
  const caps = capsFor(prop.data, user.uid);
  const priv = usePrivateDetails(pid, caps.finance);
  if (prop.loading || (caps.finance && priv.loading)) return <LoadingBlock />;
  if (!prop.data || !caps.manage) return <ErrorNote>You can’t edit this property.</ErrorNote>;
  return <PropertyForm kind={prop.data.recordKind} existing={prop.data} existingPrivate={priv.data ?? {}} />;
}

function PropertyForm({ kind, existing, existingPrivate }: { kind: RecordKind; existing?: Property; existingPrivate?: PropertyPrivateDetails }) {
  const { actor, user, profile, market: userMarket } = useAuthed();
  const nav = useNavigate();
  const toast = useToast();
  const market = existing ? getMarket(existing.marketId) : userMarket;
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<PropertyType>(existing?.type ?? 'apartment');
  const [address, setAddress] = useState<Address>(existing?.address ?? { line1: '', city: '', country: market.country });
  const [unitNumber, setUnit] = useState(existing?.unitNumber ?? '');
  const [buildingName, setBuilding] = useState(existing?.buildingName ?? '');
  const [portfolio, setPortfolio] = useState(existing?.portfolio ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [priv, setPriv] = useState<PropertyPrivateDetails>(existingPrivate ?? {});
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const v = validateProperty({ name, type, address });
  const err = (k: keyof typeof v.errors) => (touched ? v.errors[k] : undefined);
  const a = (k: keyof Address) => (val: string) => setAddress({ ...address, [k]: val });
  const p = <K extends keyof PropertyPrivateDetails>(k: K) => (val: PropertyPrivateDetails[K]) => setPriv({ ...priv, [k]: val || undefined });
  const money = (label: string, k: 'purchasePrice' | 'estimatedMarketValue' | 'bondBalance' | 'bondMonthlyRepayment' | 'ratesMonthly' | 'leviesMonthly' | 'insuranceMonthly', hint?: string) => (
    <MoneyField label={label} optional hint={hint} value={priv[k]} onChange={(val) => setPriv({ ...priv, [k]: val })} currency={market.currency} locale={market.locale} />
  );

  const save = async () => {
    setTouched(true);
    if (!v.ok) return;
    setBusy(true);
    setError('');
    const input = {
      name: name.trim(),
      type,
      address: { ...address, line1: address.line1.trim(), city: address.city.trim() },
      unitNumber: unitNumber.trim() || undefined,
      buildingName: buildingName.trim() || undefined,
      portfolio: portfolio.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      if (existing) {
        await updateProperty(existing.id, input, actor);
        if (JSON.stringify(priv) !== JSON.stringify(existingPrivate ?? {})) await savePrivateDetails(existing.id, priv, actor);
        toast('Property saved');
        nav(`/properties/${existing.id}`);
      } else {
        const id = await createProperty(input, kind, { ...actor, email: user.email ?? undefined }, profile.marketId, priv);
        toast('Property added');
        nav(`/properties/${id}`, { replace: true });
      }
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="animate-rise mx-auto max-w-3xl">
      <PageHeader
        eyebrow={kind === 'tenant' ? 'A home I rent' : 'A property I own or manage'}
        title={existing ? 'Edit property' : kind === 'tenant' ? 'Add your rented home' : 'Add a property'}
        back={existing ? { to: `/properties/${existing.id}`, label: existing.name } : { to: '/properties', label: 'Properties' }}
      />
      <div className="space-y-6">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink">The property</h2>
          <TextField label="Name" value={name} onChange={setName} error={err('name')} placeholder={kind === 'tenant' ? 'My flat in Observatory' : 'Sea Point flat'} hint="Any name that helps you recognise it." />
          <div>
            <div className="mb-1.5 text-sm font-semibold text-ink-2">Type</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Property type">
              {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cx('rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors', type === t ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-2 hover:bg-surface-2')}>
                  {PROPERTY_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <TextField label="Street address" value={address.line1} onChange={a('line1')} error={err('line1')} autoComplete="address-line1" />
            <TextField label="Unit number" optional value={unitNumber} onChange={setUnit} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Suburb" optional value={address.suburb ?? ''} onChange={a('suburb')} />
            <TextField label="Town or city" value={address.city} onChange={a('city')} error={err('city')} autoComplete="address-level2" />
            <TextField label={market.terms.province} optional value={address.province ?? ''} onChange={a('province')} autoComplete="address-level1" />
            <TextField label={market.terms.postalCode} optional value={address.postalCode ?? ''} onChange={a('postalCode')} autoComplete="postal-code" />
          </div>
          {kind === 'landlord' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Building or complex" optional value={buildingName} onChange={setBuilding} hint="Groups units in the same building." />
              <TextField label="Portfolio" optional value={portfolio} onChange={setPortfolio} hint="For filtering, e.g. “Family trust”." />
            </div>
          )}
          <TextArea label="Notes" optional value={notes} onChange={setNotes} hint={kind === 'landlord' ? 'Visible to everyone on this property, including tenants.' : 'Visible to people you invite to this record.'} />
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 text-accent" />
            <div>
              <h2 className="font-semibold text-ink">{kind === 'landlord' ? 'Ownership and finance' : 'Private notes'}</h2>
              <p className="text-sm text-ink-3">{kind === 'landlord' ? 'Only you and your team (co-owners, managers, agents) can see this. Tenants and contractors never can.' : 'Only you can see this.'}</p>
            </div>
          </div>
          {kind === 'landlord' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Legal owner" optional value={priv.ownershipEntity ?? ''} onChange={p('ownershipEntity')} hint="Person, company or trust that owns it." />
                <TextField label="Managing agent" optional value={priv.managingAgent ?? ''} onChange={p('managingAgent')} />
                {money('Purchase price', 'purchasePrice')}
                <TextField label="Purchase date" optional type="date" value={priv.purchaseDate ?? ''} onChange={p('purchaseDate')} />
                {money('Estimated market value', 'estimatedMarketValue', 'Your estimate. Shown separately from accounting values and never treated as audited.')}
                <TextField label="Valuation date" optional type="date" value={priv.marketValueDate ?? ''} onChange={p('marketValueDate')} />
              </div>
              <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                <TextField label={`${market.terms.bond} lender`} optional value={priv.bondLender ?? ''} onChange={p('bondLender')} />
                <TextField label="Account reference" optional value={priv.bondAccountRef ?? ''} onChange={p('bondAccountRef')} />
                {money(`${market.terms.bond} balance`, 'bondBalance')}
                {money('Monthly instalment', 'bondMonthlyRepayment', 'Includes interest and principal. Principal is not an expense.')}
              </div>
              <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
                {money(`${market.terms.rates} (monthly)`, 'ratesMonthly')}
                {money(`${market.terms.levies} (monthly)`, 'leviesMonthly')}
                {money('Insurance (monthly)', 'insuranceMonthly')}
                <TextField label="Insurer" optional value={priv.insurer ?? ''} onChange={p('insurer')} />
                <TextField label="Policy number" optional value={priv.insurancePolicyRef ?? ''} onChange={p('insurancePolicyRef')} />
                <TextField label="Insurance renewal" optional type="date" value={priv.insuranceRenewalDate ?? ''} onChange={p('insuranceRenewalDate')} />
              </div>
              <InfoNote>These figures describe the property. The accounting ledger (income statement, balance sheet, cash flow) is built on separate journal entries in a later phase, so nothing here is posted as a transaction.</InfoNote>
            </>
          ) : (
            <TextArea label="Notes for yourself" optional value={priv.ownershipNotes ?? ''} onChange={p('ownershipNotes')} hint="E.g. landlord’s contact details or agent reference." />
          )}
        </Card>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => nav(-1)}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {existing ? 'Save changes' : 'Add property'}
          </Button>
        </div>
      </div>
    </div>
  );
}
