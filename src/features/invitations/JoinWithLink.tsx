import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { parseInviteToken } from '@/domain/invitation';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { TextArea } from '@/ui/Field';

/** In the native app, invitation links open the website; this lets people paste the link to accept it in the app. */
export function JoinWithLinkButton({ variant = 'ghost' }: { variant?: 'ghost' | 'secondary' }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const token = parseInviteToken(text);
  return (
    <>
      <Button variant={variant} icon={<Link2 className="size-4" />} onClick={() => setOpen(true)}>
        Join with a link
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Join with an invitation"
        description="Paste the invitation link (or the whole message) someone sent you."
        footer={
          <Button
            disabled={!token}
            onClick={() => {
              setOpen(false);
              nav(`/invite/${token}`);
            }}
          >
            Open invitation
          </Button>
        }
      >
        <TextArea label="Invitation link" value={text} onChange={setText} rows={3} error={text.trim() && !token ? 'That doesn’t look like an invitation link.' : undefined} />
      </Dialog>
    </>
  );
}
