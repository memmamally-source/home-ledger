import type { PropertyRole } from './roles';

export const INVITE_TTL_DAYS = 14;

export type InvitationStatus = 'pending' | 'accepted' | 'revoked';

/** `invitations/{token}`: the document id is the unguessable token in the link. */
export interface Invitation {
  id: string;
  propertyId: string;
  propertyName: string;
  tenancyId?: string;
  role: PropertyRole;
  /** When set, only an account signed in with this (verified) email can accept. */
  email?: string;
  invitedBy: string;
  invitedByName: string;
  message?: string;
  status: InvitationStatus;
  createdAt?: unknown;
  expiresAt: Date | { toDate(): Date };
  acceptedBy?: string;
  acceptedAt?: unknown;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function inviteExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);
}

function asDate(d: Invitation['expiresAt']): Date {
  return d instanceof Date ? d : d.toDate();
}

export type InviteProblem = 'accepted' | 'revoked' | 'expired' | 'wrong_email' | 'unverified_email' | 'own_invite' | 'already_member';

export function inviteProblem(
  inv: Pick<Invitation, 'status' | 'expiresAt' | 'email' | 'invitedBy'>,
  user: { uid: string; email?: string | null; emailVerified: boolean },
  opts: { alreadyMember?: boolean; now?: Date } = {},
): InviteProblem | null {
  if (inv.status === 'accepted') return 'accepted';
  if (inv.status === 'revoked') return 'revoked';
  if (asDate(inv.expiresAt).getTime() <= (opts.now ?? new Date()).getTime()) return 'expired';
  if (inv.invitedBy === user.uid) return 'own_invite';
  if (opts.alreadyMember) return 'already_member';
  if (inv.email) {
    if (!user.email || normaliseEmail(user.email) !== inv.email) return 'wrong_email';
    if (!user.emailVerified) return 'unverified_email';
  }
  return null;
}

export const INVITE_PROBLEM_MESSAGES: Record<InviteProblem, string> = {
  accepted: 'This invitation has already been accepted.',
  revoked: 'This invitation was cancelled by the person who sent it.',
  expired: 'This invitation has expired. Ask for a new one.',
  wrong_email: 'This invitation was sent to a different email address. Sign in with that address to accept it.',
  unverified_email: 'Verify your email address first, then open this link again.',
  own_invite: 'You created this invitation. Send the link to the person you are inviting.',
  already_member: 'You already have access to this property.',
};

/** Builds the link to share. Uses the hash router so it works on GitHub Pages and in the native shell. */
export function inviteLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/#.*$/, '').replace(/\/?$/, '/')}#/invite/${token}`;
}
