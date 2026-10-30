import { ChevronDown, ChevronLeft, ChevronRight, Flag, ListChecks, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { groupedItems, roomProgress, sortedRooms } from '@/domain/inspection/logic';
import { groupLabel } from '@/domain/inspection/templates';
import { CONDITION_LABELS, SEVERITY_LABELS, type Inspection, type InspectionItem, type InspectionRoom, type ItemCondition, type Severity } from '@/domain/inspection/types';
import { addItem, markRemaining, missingTemplateItems, removeCustomItem, removeRoom, renameRoom, setCondition, setRoomNotes, updateItem } from '@/data/inspections';
import { friendlyError } from '@/lib/live';
import { useAuthed } from '@/app/session';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Dialog } from '@/ui/Dialog';
import { ErrorNote, InfoNote } from '@/ui/EmptyState';
import { Switch, TextArea, TextField } from '@/ui/Field';
import { ProgressBar } from '@/ui/Progress';
import { LoadingBlock } from '@/ui/Spinner';
import { useToast } from '@/ui/Toast';
import { cx } from '@/ui/cx';
import { AddPhotoButton, ConditionBadge, ConditionPicker, EvidenceGrid, LibraryButton, useInspectionContext } from './shared';

export function RoomPage() {
  const { pid, iid, rid } = useParams();
  const ctx = useInspectionContext(pid, iid);
  const nav = useNavigate();
  const toast = useToast();
  const [bulk, setBulk] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  if (ctx.loading) return <LoadingBlock />;
  const i = ctx.i;
  const room = i?.rooms[rid ?? ''];
  if (!i || !room) return <ErrorNote>This room isn’t available.</ErrorNote>;
  const rooms = sortedRooms(i.rooms);
  const idx = rooms.findIndex((r) => r.id === room.id);
  const prev = rooms[idx - 1];
  const next = rooms[idx + 1];
  const pr = roomProgress(room);
  const roomEvidence = ctx.evidence.filter((e) => e.roomId === room.id && !e.itemId);
  const roomQueued = ctx.uploads.filter((u) => u.roomId === room.id && !u.itemId);
  const hasEvidence = ctx.evidence.some((e) => e.roomId === room.id) || ctx.uploads.some((u) => u.roomId === room.id);
  const fail = (e: unknown) => toast(friendlyError(e), 'bad');

  return (
    <div className="animate-rise mx-auto max-w-3xl">
      <div className="sticky top-[env(safe-area-inset-top)] z-30 -mx-4 mb-5 border-b border-line bg-bg/95 px-4 pt-2 pb-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <Link to={`/properties/${pid}/inspections/${iid}`} className="inline-flex items-center gap-1 py-1 text-sm font-semibold text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" /> {i.title}
        </Link>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="truncate font-display text-2xl font-semibold text-ink">
            {room.name}
            <span className="ml-2 align-middle text-sm font-sans font-semibold text-ink-3">
              Room {idx + 1} of {rooms.length}
            </span>
          </h1>
          {ctx.canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>
              Rename
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <ProgressBar className="flex-1" value={pr.percent} tone={pr.percent === 100 ? 'good' : 'accent'} label="Room progress" />
          <span className="text-xs font-semibold text-ink-3 tabular-nums">
            {pr.checked}/{pr.total}
          </span>
        </div>
      </div>

      {!ctx.canEdit && i.status === 'draft' && <div className="mb-4"><InfoNote>You can view this draft. Only its author and their team can change it.</InfoNote></div>}
      {i.status === 'completed' && <div className="mb-4"><InfoNote>This inspection is completed, so findings are locked. You can still add later photos; they are marked as added later.</InfoNote></div>}

      <div className="space-y-6">
        {groupedItems(room).map((g) => (
          <section key={g.group}>
            <h2 className="mb-2 px-1 text-xs font-bold tracking-wider text-ink-3 uppercase">{groupLabel(i.templateSet, g.group)}</h2>
            <Card className="divide-y divide-line">
              {g.items.map((item) => (
                <ItemRow key={item.id} i={i} room={room} item={item} ctx={ctx} />
              ))}
            </Card>
          </section>
        ))}

        <Card className="space-y-4 p-5">
          <h2 className="font-semibold text-ink">Room photos and notes</h2>
          <EvidenceGrid evidence={roomEvidence} queued={roomQueued} empty="Wide shots of the whole room help show overall condition." />
          {(ctx.canEdit || ctx.canAddendum) && (
            <div className="flex gap-2">
              <AddPhotoButton i={i} roomId={room.id} addendum={i.status === 'completed'} />
              <LibraryButton i={i} roomId={room.id} addendum={i.status === 'completed'} />
            </div>
          )}
          {ctx.canEdit ? <DeferredText key={`${room.id}-notes`} label="Room notes" value={room.notes} onSave={(v) => setRoomNotes(i, room.id, v).catch(fail)} /> : room.notes && <p className="text-sm whitespace-pre-wrap text-ink-2">{room.notes}</p>}
        </Card>

        {ctx.canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add an item
            </Button>
            {pr.unchecked > 0 && (
              <Button variant="ghost" icon={<ListChecks className="size-4" />} onClick={() => setBulk(true)}>
                Mark remaining…
              </Button>
            )}
            {!hasEvidence && (
              <Button
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                onClick={() => {
                  if (!confirm(`Remove ${room.name} from this inspection?`)) return;
                  removeRoom(i, room.id).catch(fail);
                  nav(`/properties/${pid}/inspections/${iid}`);
                }}
              >
                Remove room
              </Button>
            )}
          </div>
        )}

        <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Rooms">
          {prev ? (
            <Link to={`../rooms/${prev.id}`} relative="path" className="flex min-w-0 items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-2 hover:bg-surface-2">
              <ChevronLeft className="size-4 shrink-0" /> <span className="truncate">{prev.name}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={`../rooms/${next.id}`} relative="path" className="flex min-w-0 items-center gap-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover">
              <span className="truncate">Next: {next.name}</span> <ChevronRight className="size-4 shrink-0" />
            </Link>
          ) : (
            <Link to={`/properties/${pid}/inspections/${iid}${ctx.canEdit ? '/review' : ''}`} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover">
              {ctx.canEdit ? 'Review inspection' : 'Back to overview'}
            </Link>
          )}
        </nav>
      </div>

      {bulk && <BulkDialog i={i} room={room} onClose={() => setBulk(false)} />}
      {adding && <AddItemDialog i={i} room={room} onClose={() => setAdding(false)} />}
      {renaming && (
        <RenameDialog
          name={room.name}
          onClose={() => setRenaming(false)}
          onSave={(n) => {
            renameRoom(i, room.id, n).catch(fail);
            setRenaming(false);
          }}
        />
      )}
    </div>
  );
}

function ItemRow({ i, room, item, ctx }: { i: Inspection; room: InspectionRoom; item: InspectionItem; ctx: ReturnType<typeof useInspectionContext> }) {
  const { actor } = useAuthed();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const fail = (e: unknown) => toast(friendlyError(e), 'bad');
  const ev = ctx.evidence.filter((e) => e.itemId === item.id);
  const queued = ctx.uploads.filter((u) => u.itemId === item.id);
  const photoCount = ev.length + queued.length;
  const hasNotes = Boolean(item.comment || item.defectDescription);
  const save = (patch: Partial<InspectionItem>) => void updateItem(i, room.id, item, patch, actor).catch(fail);

  return (
    <div className={cx('px-4 py-3.5 sm:px-5', item.condition === 'defective' && 'bg-bad-soft/30')}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{item.label}</span>
            {item.custom && <span className="rounded bg-info-soft px-1.5 text-[10px] font-bold text-info-ink">ADDED</span>}
            {item.followUp && <Flag className="size-3.5 text-bad" aria-label="Follow-up needed" />}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
            {!ctx.canEdit && <ConditionBadge c={item.condition} />}
            {item.condition === 'defective' && item.severity && <span className="font-semibold text-bad">{SEVERITY_LABELS[item.severity]}</span>}
            {photoCount > 0 && <span>{photoCount} photo{photoCount > 1 ? 's' : ''}</span>}
            {hasNotes && <MessageSquare className="size-3.5" aria-label="Has notes" />}
            {!hasNotes && !photoCount && !open && ctx.canEdit && <span>Tap for notes and photos</span>}
          </div>
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="rounded-lg p-1 text-ink-3 hover:bg-surface-2" aria-label={open ? 'Hide details' : 'Show details'}>
          <ChevronDown className={cx('size-5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {ctx.canEdit && (
        <div className="mt-3">
          <ConditionPicker
            label={item.label}
            value={item.condition}
            onChange={(c) => {
              void setCondition(i, room.id, item, c, actor).catch(fail);
              if (c === 'defective' && item.condition !== 'defective') setOpen(true);
            }}
          />
        </div>
      )}
      {open && (
        <div className="animate-rise mt-4 space-y-4">
          {ctx.canEdit ? (
            <>
              {item.condition === 'defective' && (
                <>
                  <DeferredText key={`${item.id}-defect`} label="What’s wrong" value={item.defectDescription} rows={2} placeholder="E.g. tap drips constantly; chip in basin rim" onSave={(v) => save({ defectDescription: v })} />
                  <div>
                    <div className="mb-1.5 text-sm font-semibold text-ink-2">Severity</div>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Severity">
                      {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
                        <button key={s} type="button" role="radio" aria-checked={item.severity === s} onClick={() => save({ severity: s })} className={cx('rounded-full border px-3 py-1 text-sm font-semibold', item.severity === s ? 'border-bad bg-bad-soft text-bad-ink' : 'border-line-strong text-ink-2')}>
                          {SEVERITY_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <DeferredText key={`${item.id}-comment`} label="Comments" value={item.comment} rows={2} onSave={(v) => save({ comment: v })} />
              <Switch checked={item.followUp} onChange={(v) => save({ followUp: v })} label="Follow-up required" description="Shows on the dashboard until handled." />
            </>
          ) : (
            <div className="space-y-2 text-sm">
              {item.defectDescription && <p className="text-bad-ink">{item.defectDescription}</p>}
              {item.comment && <p className="whitespace-pre-wrap text-ink-2">{item.comment}</p>}
              {!item.defectDescription && !item.comment && <p className="text-ink-3">No notes.</p>}
            </div>
          )}
          <EvidenceGrid evidence={ev} queued={queued} />
          <div className="flex flex-wrap gap-2">
            {(ctx.canEdit || ctx.canAddendum) && (
              <>
                <AddPhotoButton i={i} roomId={room.id} itemId={item.id} addendum={i.status === 'completed'} />
                <LibraryButton i={i} roomId={room.id} itemId={item.id} addendum={i.status === 'completed'} />
              </>
            )}
            {ctx.canEdit && item.custom && photoCount === 0 && (
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => void removeCustomItem(i, room.id, item.id).catch(fail)}>
                Remove item
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Saves when the field loses focus, so typing doesn't write on every keystroke. */
function DeferredText({ label, value, onSave, rows = 3, placeholder }: { label: string; value: string; onSave: (v: string) => void; rows?: number; placeholder?: string }) {
  const [text, setText] = useState(value);
  return <TextArea label={label} optional value={text} rows={rows} placeholder={placeholder} onChange={setText} onBlur={() => text !== value && onSave(text.trim())} />;
}

function BulkDialog({ i, room, onClose }: { i: Inspection; room: InspectionRoom; onClose: () => void }) {
  const { actor } = useAuthed();
  const toast = useToast();
  const n = roomProgress(room).unchecked;
  const run = (c: ItemCondition) => {
    markRemaining(i, room, c, actor).catch((e) => toast(friendlyError(e), 'bad'));
    toast(`${n} item${n === 1 ? '' : 's'} marked ${CONDITION_LABELS[c].toLowerCase()}`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={`Mark the ${n} unchecked item${n === 1 ? '' : 's'}`} description="Only items you haven’t marked are changed. Choose “Good” only if you actually checked them.">
      <div className="grid gap-2 pb-2">
        <Button variant="secondary" onClick={() => run('good')}>
          I checked them: all good
        </Button>
        <Button variant="secondary" onClick={() => run('na')}>
          Not applicable in this room
        </Button>
        <Button variant="secondary" onClick={() => run('not_tested')}>
          Not tested
        </Button>
      </div>
    </Dialog>
  );
}

function AddItemDialog({ i, room, onClose }: { i: Inspection; room: InspectionRoom; onClose: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const missing = missingTemplateItems(i, room);
  const add = (l: string) => {
    if (!l.trim()) return;
    addItem(i, room, l).catch((e) => toast(friendlyError(e), 'bad'));
    toast(`Added “${l.trim()}”`);
    setLabel('');
  };
  return (
    <Dialog open onClose={onClose} title="Add an item" footer={<Button onClick={onClose} variant="secondary">Done</Button>}>
      <div className="space-y-4 pb-2">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(label);
          }}
        >
          <TextField className="flex-1" label="Item" value={label} onChange={setLabel} placeholder="E.g. Ceiling fan, wine fridge" />
          <Button type="submit" disabled={!label.trim()}>
            Add
          </Button>
        </form>
        {missing.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-semibold text-ink-2">Standard items not in this room</div>
            <div className="flex flex-wrap gap-2">
              {missing.map((m) => (
                <button key={m} type="button" className="rounded-full border border-line-strong px-3 py-1 text-sm text-ink-2 hover:bg-surface-2" onClick={() => add(m)}>
                  + {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function RenameDialog({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (n: string) => void }) {
  const [v, setV] = useState(name);
  return (
    <Dialog open onClose={onClose} title="Rename room" footer={<Button onClick={() => v.trim() && onSave(v)}>Save</Button>}>
      <TextField label="Name" value={v} onChange={setV} />
    </Dialog>
  );
}
