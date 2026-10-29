import { Download, LogOut, ShieldAlert, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Brand } from '@/config/brand';
import { MARKETS } from '@/config/markets';
import { exportMyData, getDeletionRequest, requestDeletion } from '@/data/account';
import { resendVerification, signOut } from '@/data/auth';
import { updateProfile, type Intent, type ThemePreference } from '@/data/users';
import { usingEmulators } from '@/lib/firebase';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { applyTheme } from '@/app/theme';
import { Button } from '@/ui/Button';
import { Card, CardHeader } from '@/ui/Card';
import { Dialog } from '@/ui/Dialog';
import { InfoNote } from '@/ui/EmptyState';
import { SelectField, Switch, TextArea, TextField } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Tabs';
import { useToast } from '@/ui/Toast';

export function SettingsPage() {
  const { user, profile } = useAuthed();
  const toast = useToast();
  const [name, setName] = useState(profile.displayName);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletion, setDeletion] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let live = true;
    getDeletionRequest(user.uid).then((d) => live && setDeletion(d), () => undefined);
    return () => {
      live = false;
    };
  }, [user.uid]);

  const save = (patch: Parameters<typeof updateProfile>[1], msg = 'Saved') => updateProfile(user.uid, patch).then(() => toast(msg), (e) => toast(friendlyError(e), 'bad'));
  const toggleIntent = (i: Intent, on: boolean) => {
    const next = on ? [...new Set([...profile.intents, i])] : profile.intents.filter((x) => x !== i);
    void save({ intents: next });
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const blob = await exportMyData(user.uid);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${Brand.name.toLowerCase()}-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch (e) {
      toast(friendlyError(e), 'bad');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="animate-rise mx-auto max-w-2xl">
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <CardHeader title="Profile" icon={<UserRound className="size-5" />} />
          <div className="flex items-end gap-2">
            <TextField className="flex-1" label="Name" value={name} onChange={setName} />
            <Button variant="secondary" disabled={!name.trim() || name === profile.displayName} onClick={() => save({ displayName: name.trim() })}>
              Save
            </Button>
          </div>
          <div className="text-sm">
            <div className="font-semibold text-ink-2">Email</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-ink">
              {user.email}
              {user.emailVerified ? (
                <span className="text-xs text-good">Verified</span>
              ) : (
                <button className="text-xs font-semibold text-accent" onClick={() => resendVerification().then(() => toast('Verification email requested'), (e) => toast(friendlyError(e), 'bad'))}>
                  Not verified. Send link
                </button>
              )}
            </div>
          </div>
          <SelectField label="Country" value={profile.marketId} onChange={(m) => save({ marketId: m })} options={Object.values(MARKETS).map((m) => ({ value: m.id, label: `${m.name} (${m.currency})` }))} hint="Used for new properties. Existing properties keep their own currency." />
        </Card>

        <Card className="space-y-4 p-5">
          <CardHeader title="How you use the app" subtitle="Shows the matching sections on Home. Your access to each property comes from your role on it." />
          <Switch checked={profile.intents.includes('landlord')} onChange={(v) => toggleIntent('landlord', v)} label="Landlord" description="Portfolio, tenancies and owner records." />
          <Switch checked={profile.intents.includes('tenant')} onChange={(v) => toggleIntent('tenant', v)} label="Tenant" description="Your rented home and its records." />
        </Card>

        <Card className="flex items-center justify-between gap-4 p-5">
          <div>
            <div className="font-semibold text-ink">Appearance</div>
            <div className="text-sm text-ink-3">Light is the default.</div>
          </div>
          <Segmented
            label="Theme"
            value={profile.theme}
            onChange={(t: ThemePreference) => {
              applyTheme(t);
              void save({ theme: t }, 'Theme updated');
            }}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'Auto' },
            ]}
          />
        </Card>

        <Card className="space-y-4 p-5">
          <CardHeader title="Your data" />
          <p className="text-sm text-ink-2">Download everything you can access as a JSON file: properties, tenancies, inspections, evidence records (with file hashes) and signatures.</p>
          <Button variant="secondary" loading={exporting} icon={<Download className="size-4" />} onClick={exportData}>
            Export my data
          </Button>
          <div className="border-t border-line pt-4">
            {deletion ? (
              <InfoNote tone="warn">You asked for your account to be deleted. It hasn’t been processed yet: deletion runs on the server, which isn’t switched on in this test version. You can keep using the app meanwhile.</InfoNote>
            ) : (
              <Button variant="danger" icon={<ShieldAlert className="size-4" />} onClick={() => setDeleting(true)}>
                Request account deletion
              </Button>
            )}
          </div>
        </Card>

        <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
          Sign out
        </Button>
        <p className="text-center text-xs text-ink-3">
          {Brand.name} (working name) · test version{usingEmulators ? ' · local emulators' : ''}. All features are free while we test.
        </p>
      </div>
      {deleting && <DeletionDialog onClose={() => setDeleting(false)} onDone={() => setDeletion({ status: 'requested' })} />}
    </div>
  );
}

function DeletionDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuthed();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Request account deletion"
      footer={
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await requestDeletion(user.uid, reason);
              toast('Deletion request recorded');
              onDone();
              onClose();
            } catch (e) {
              toast(friendlyError(e), 'bad');
              setBusy(false);
            }
          }}
        >
          Record request
        </Button>
      }
    >
      <div className="space-y-4 pb-2 text-sm leading-relaxed text-ink-2">
        <p>Export your data first if you want a copy. When deletion is processed:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your profile, sign-in and the property records you own are removed.</li>
          <li>Inspections you shared with others stay available to them (it is their record too), with your name kept on what you submitted.</li>
          <li>Records may be kept longer where the law requires it.</li>
        </ul>
        <InfoNote tone="warn">In this test version the request is recorded but not processed automatically: deletion needs a server function that isn’t deployed yet.</InfoNote>
        <TextArea label="Reason" optional value={reason} onChange={setReason} rows={2} />
      </div>
    </Dialog>
  );
}
