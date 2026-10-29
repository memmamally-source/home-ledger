import { CheckCircle2, MailWarning, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { resendVerification } from '@/data/auth';
import { acceptInvitation, getInvitation } from '@/data/invitations';
import { INVITE_PROBLEM_MESSAGES, inviteProblem, type Invitation } from '@/domain/invitation';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/domain/roles';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { Button, ButtonLink } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState, ErrorNote, InfoNote } from '@/ui/EmptyState';
import { LoadingBlock } from '@/ui/Spinner';
import { useToast } from '@/ui/Toast';

export function AcceptInvitePage() {
  const { token } = useParams();
  const { user, actor } = useAuthed();
  const nav = useNavigate();
  const toast = useToast();
  const [state, setState] = useState<{ token?: string; inv: Invitation | null; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let live = true;
    getInvitation(token).then(
      (inv) => live && setState({ token, inv }),
      (e) => live && setState({ token, inv: null, error: friendlyError(e) }),
    );
    return () => {
      live = false;
    };
  }, [token]);

  if (!state || state.token !== token) return <LoadingBlock label="Opening invitation…" />;
  const inv = state.inv;
  if (!inv)
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState icon={<MailWarning className="size-6" />} title="Invitation not found" action={<ButtonLink to="/" variant="secondary">Go home</ButtonLink>}>
          {state.error ?? 'Check the link is complete, or ask the sender for a new one.'}
        </EmptyState>
      </Card>
    );

  const problem = inviteProblem(inv, { uid: user.uid, email: user.email, emailVerified: user.emailVerified });

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      await acceptInvitation(inv, { ...actor, email: user.email ?? undefined });
      toast(`You joined ${inv.propertyName}`);
      nav(`/properties/${inv.propertyId}`, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="animate-rise mx-auto max-w-lg">
      <Card className="p-6 sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          <UserPlus className="size-6" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
          {inv.invitedByName} invited you to {inv.propertyName}
        </h1>
        <p className="mt-2 text-ink-2">
          You’ll join as <strong>{ROLE_LABELS[inv.role]}</strong>. {ROLE_DESCRIPTIONS[inv.role]}
        </p>
        {inv.message && <blockquote className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2 italic">“{inv.message}”</blockquote>}
        <ul className="mt-6 space-y-2.5 text-sm text-ink-2">
          <li className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" /> Your own records stay yours. Nothing you already have is merged or shared by accepting.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" /> You can leave the property at any time and keep the inspections you took part in.
          </li>
        </ul>
        <div className="mt-6 space-y-3">
          {problem ? (
            <>
              <ErrorNote>{INVITE_PROBLEM_MESSAGES[problem]}</ErrorNote>
              {problem === 'unverified_email' && (
                <Button variant="secondary" onClick={() => resendVerification().then(() => toast('Verification email requested'), (e) => toast(friendlyError(e), 'bad'))}>
                  Send verification email again
                </Button>
              )}
              {problem === 'already_member' || problem === 'accepted' ? <ButtonLink to={`/properties/${inv.propertyId}`}>Open property</ButtonLink> : null}
            </>
          ) : (
            <>
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button size="lg" className="w-full" loading={busy} onClick={accept}>
                Accept invitation
              </Button>
              <InfoNote>Signed in as {user.email}.</InfoNote>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
