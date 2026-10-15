import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createAnnouncement, deleteAnnouncement, updateAnnouncement,
  getGetAdminAnnouncementsQueryKey, getGetAnnouncementsQueryKey, useGetAdminAnnouncements,
  type Announcement, type AnnouncementList,
} from '@workspace/api-client-react';
import { isSafeAnnouncementLink } from '@/utils/announcement-slider';

type Draft = { text: string; link: string; displayOrder: string; enabled: boolean };
type Notice = { kind: 'error' | 'conflict' | 'success'; message: string } | null;

const emptyDraft: Draft = { text: '', link: '', displayOrder: '0', enabled: true };
const toDraft = (a: Announcement): Draft => ({ text: a.text, link: a.link ?? '', displayOrder: String(a.displayOrder), enabled: a.enabled });
const sameDraft = (a: Draft, b: Draft) => a.text === b.text && a.link === b.link && a.displayOrder === b.displayOrder && a.enabled === b.enabled;

function validate(draft: Draft): { input?: { text: string; link: string | null; displayOrder: number; enabled: boolean }; error?: string } {
  const text = draft.text.trim();
  if (text.length < 1 || text.length > 160) return { error: 'Message must be between 1 and 160 characters.' };
  const linkRaw = draft.link.trim();
  if (linkRaw && !isSafeAnnouncementLink(linkRaw)) return { error: 'Link must start with / (a page on this site) or https://.' };
  const order = Number(draft.displayOrder);
  if (draft.displayOrder.trim() === '' || !Number.isInteger(order) || order < 0 || order > 10000) return { error: 'Display order must be a whole number from 0 to 10000.' };
  return { input: { text, link: linkRaw || null, displayOrder: order, enabled: draft.enabled } };
}

function describeError(error: unknown): Notice {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: unknown }).status) : 0;
  if (status === 409) return { kind: 'conflict', message: 'Someone else changed this announcement. Your draft is kept — reload to see the latest version, then reapply your edits.' };
  if (status === 404) return { kind: 'conflict', message: 'This announcement has already been deleted. Reload to refresh the list.' };
  if (status === 401 || status === 403) return { kind: 'error', message: 'Your admin session has expired or lacks permission. Sign in again — your draft is kept.' };
  if (status === 400) return { kind: 'error', message: 'The server rejected these values. Check the message, link and order.' };
  if (status >= 500) return { kind: 'error', message: 'The server is unavailable right now. Your draft is kept — try again shortly.' };
  return { kind: 'error', message: 'Could not save. Check your connection and try again — your draft is kept.' };
}

function Fields({ idPrefix, draft, onChange, disabled }: { idPrefix: string; draft: Draft; onChange: (d: Draft) => void; disabled: boolean }) {
  return (
    <div className="admin-ann-fields">
      <label className="admin-ann-field admin-ann-text" htmlFor={`${idPrefix}-text`}>
        <span>Message <small>{draft.text.trim().length}/160</small></span>
        <textarea id={`${idPrefix}-text`} rows={2} maxLength={200} value={draft.text} disabled={disabled} onChange={(e) => onChange({ ...draft, text: e.target.value })} data-testid={`input-${idPrefix}-text`} />
      </label>
      <label className="admin-ann-field" htmlFor={`${idPrefix}-link`}>
        <span>Link <small>optional</small></span>
        <input id={`${idPrefix}-link`} type="text" inputMode="url" placeholder="/shop or https://…" value={draft.link} disabled={disabled} onChange={(e) => onChange({ ...draft, link: e.target.value })} data-testid={`input-${idPrefix}-link`} />
      </label>
      <label className="admin-ann-field admin-ann-order" htmlFor={`${idPrefix}-order`}>
        <span>Order</span>
        <input id={`${idPrefix}-order`} type="number" min={0} max={10000} step={1} value={draft.displayOrder} disabled={disabled} onChange={(e) => onChange({ ...draft, displayOrder: e.target.value })} data-testid={`input-${idPrefix}-order`} />
      </label>
      <label className="admin-ann-toggle" htmlFor={`${idPrefix}-enabled`}>
        <input id={`${idPrefix}-enabled`} type="checkbox" checked={draft.enabled} disabled={disabled} onChange={(e) => onChange({ ...draft, enabled: e.target.checked })} data-testid={`checkbox-${idPrefix}-enabled`} />
        <span>{draft.enabled ? 'Showing on site' : 'Hidden'}</span>
      </label>
    </div>
  );
}

function NoticeLine({ notice, onReload }: { notice: Notice; onReload: () => void }) {
  if (!notice) return null;
  return (
    <div className={`admin-ann-notice is-${notice.kind}`} role={notice.kind === 'success' ? 'status' : 'alert'} data-testid="status-announcement-notice">
      <span>{notice.message}</span>
      {notice.kind === 'conflict' && <button type="button" className="admin-secondary" onClick={onReload} data-testid="button-announcement-reload">Reload latest</button>}
    </div>
  );
}

function AnnouncementRow({ item, onWritten, onReload }: { item: Announcement; onWritten: () => void; onReload: (id: number) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | 'toggle' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const base = useRef({ revision: item.revision, draft: toDraft(item) });
  const queryClient = useQueryClient();
  const dirty = !sameDraft(draft, base.current.draft);

  // Adopt newer server data only when the admin has no unsaved edits.
  useEffect(() => {
    if (item.revision === base.current.revision) return;
    if (!sameDraft(draft, base.current.draft)) return;
    const fresh = toDraft(item);
    base.current = { revision: item.revision, draft: fresh };
    setDraft(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.revision]);

  const patchCache = (saved: Announcement) => {
    queryClient.setQueryData<AnnouncementList>(getGetAdminAnnouncementsQueryKey(), (old) => old ? { announcements: old.announcements.map((a) => a.id === saved.id ? saved : a).sort((x, y) => x.displayOrder - y.displayOrder || x.id - y.id) } : old);
  };

  const save = async (next: Draft, kind: 'save' | 'toggle') => {
    const { input, error } = validate(next);
    if (!input) { setNotice({ kind: 'error', message: error! }); return; }
    setBusy(kind); setNotice(null);
    try {
      const saved = await updateAnnouncement(item.id, { ...input, expectedRevision: base.current.revision });
      base.current = { revision: saved.revision, draft: toDraft(saved) };
      setDraft(toDraft(saved));
      patchCache(saved);
      onWritten();
      setNotice({ kind: 'success', message: kind === 'toggle' ? (saved.enabled ? 'Now showing on the site.' : 'Hidden from the site.') : 'Saved.' });
    } catch (err) {
      setDraft(next);
      setNotice(describeError(err));
    } finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy('delete'); setNotice(null);
    try {
      await deleteAnnouncement(item.id, { expectedRevision: base.current.revision });
      queryClient.setQueryData<AnnouncementList>(getGetAdminAnnouncementsQueryKey(), (old) => old ? { announcements: old.announcements.filter((a) => a.id !== item.id) } : old);
      onWritten();
    } catch (err) {
      setConfirming(false);
      setNotice(describeError(err));
      setBusy(null);
    }
  };

  const reload = () => {
    // The parent remounts this editor only after a successful refresh. Keep
    // unsaved text and the conflict message if that refresh fails.
    onReload(item.id);
  };

  return (
    <li className={`admin-ann-row${item.enabled ? '' : ' is-disabled'}`} data-testid={`row-announcement-${item.id}`}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void save(draft, 'save'); }}>
        <div className="admin-ann-row-head">
          <span className={`admin-ann-pill${item.enabled ? ' is-live' : ''}`}>{item.enabled ? 'Live' : 'Hidden'}</span>
          <span className="admin-ann-meta">#{item.id} · order {item.displayOrder}{dirty ? ' · unsaved changes' : ''}</span>
        </div>
        <Fields idPrefix={`announcement-${item.id}`} draft={draft} onChange={setDraft} disabled={busy !== null} />
        <NoticeLine notice={notice} onReload={reload} />
        <div className="admin-ann-actions">
          <button className="admin-primary" type="submit" disabled={busy !== null || !dirty} data-testid={`button-save-announcement-${item.id}`}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          {dirty && <button className="admin-secondary" type="button" disabled={busy !== null} onClick={() => { setDraft(base.current.draft); setNotice(null); }} data-testid={`button-discard-announcement-${item.id}`}>Discard</button>}
          {!dirty && <button className="admin-secondary" type="button" disabled={busy !== null} onClick={() => void save({ ...draft, enabled: !draft.enabled }, 'toggle')} data-testid={`button-toggle-announcement-${item.id}`}>{busy === 'toggle' ? 'Updating…' : item.enabled ? 'Disable' : 'Enable'}</button>}
          <span className="admin-ann-spacer" />
          {confirming ? (
            <span className="admin-ann-confirm" role="group" aria-label="Confirm delete">
              <span>Delete this announcement?</span>
              <button className="admin-danger-button" type="button" disabled={busy !== null} onClick={() => void remove()} data-testid={`button-confirm-delete-announcement-${item.id}`}>{busy === 'delete' ? 'Deleting…' : 'Yes, delete'}</button>
              <button className="admin-secondary" type="button" disabled={busy !== null} onClick={() => setConfirming(false)} data-testid={`button-cancel-delete-announcement-${item.id}`}>Keep</button>
            </span>
          ) : (
            <button className="admin-danger-button" type="button" disabled={busy !== null} onClick={() => setConfirming(true)} data-testid={`button-delete-announcement-${item.id}`}>Delete</button>
          )}
        </div>
      </form>
    </li>
  );
}

export default function AdminAnnouncements() {
  const queryClient = useQueryClient();
  const query = useGetAdminAnnouncements({ query: { queryKey: getGetAdminAnnouncementsQueryKey(), refetchOnWindowFocus: false } });
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [newNotice, setNewNotice] = useState<Notice>(null);
  const [creating, setCreating] = useState(false);
  const [rowKeys, setRowKeys] = useState<Record<number, number>>({});
  const items = query.data?.announcements ?? [];

  const refreshPublic = () => { void queryClient.invalidateQueries({ queryKey: getGetAnnouncementsQueryKey() }); };
  const reloadRow = async (id: number) => {
    await query.refetch();
    setRowKeys((k) => ({ ...k, [id]: (k[id] ?? 0) + 1 }));
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const { input, error } = validate(newDraft);
    if (!input) { setNewNotice({ kind: 'error', message: error! }); return; }
    setCreating(true); setNewNotice(null);
    try {
      const created = await createAnnouncement(input);
      queryClient.setQueryData<AnnouncementList>(getGetAdminAnnouncementsQueryKey(), (old) => ({ announcements: [...(old?.announcements ?? []), created].sort((x, y) => x.displayOrder - y.displayOrder || x.id - y.id) }));
      refreshPublic();
      setNewDraft({ ...emptyDraft, displayOrder: String(Math.min(10000, created.displayOrder + 10)) });
      setNewNotice({ kind: 'success', message: 'Announcement added.' });
    } catch (err) {
      setNewNotice(describeError(err));
    } finally { setCreating(false); }
  };

  const liveCount = items.filter((a) => a.enabled).length;
  return (
    <>
      <div className="admin-section-title">
        <div>
          <p className="admin-eyebrow">Storefront</p>
          <h1>Announcements</h1>
          <p>Short messages in the strip above the site header. Up to three show at once on desktop, one at a time on phones and tablets.</p>
        </div>
        <button className="admin-secondary" type="button" onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-announcements">{query.isFetching ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <section className="admin-panel admin-ann-new" aria-labelledby="admin-ann-new-title">
        <h2 id="admin-ann-new-title">New announcement</h2>
        <form onSubmit={create}>
          <Fields idPrefix="announcement-new" draft={newDraft} onChange={setNewDraft} disabled={creating} />
          <NoticeLine notice={newNotice} onReload={() => void query.refetch()} />
          <div className="admin-ann-actions"><button className="admin-primary" type="submit" disabled={creating} data-testid="button-create-announcement">{creating ? 'Adding…' : 'Add announcement'}</button></div>
        </form>
      </section>

      <section className="admin-panel admin-ann-list" aria-labelledby="admin-ann-list-title">
        <div className="admin-ann-list-head">
          <h2 id="admin-ann-list-title">All announcements</h2>
          {query.data && <span className="admin-muted-count" data-testid="text-announcement-count">{liveCount} live · {items.length} total</span>}
        </div>
        {query.isLoading ? (
          <ul className="admin-ann-rows" aria-busy="true">{[0, 1].map((i) => <li key={i} className="admin-ann-skeleton" />)}</ul>
        ) : query.isError ? (
          <div className="admin-ann-notice is-error" role="alert">
            <span>{describeError(query.error)?.message.replace(/ Your draft is kept.*$| — your draft is kept\.?/, '')}</span>
            <button type="button" className="admin-secondary" onClick={() => void query.refetch()} data-testid="button-retry-announcements">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="admin-ann-empty" data-testid="status-announcements-empty">
            <p><strong>No announcements yet.</strong></p>
            <p>The strip stays hidden on the storefront until you add and enable one.</p>
          </div>
        ) : (
          <ul className="admin-ann-rows">
            {items.map((item) => <AnnouncementRow key={`${item.id}-${rowKeys[item.id] ?? 0}`} item={item} onWritten={refreshPublic} onReload={(id) => void reloadRow(id)} />)}
          </ul>
        )}
      </section>
    </>
  );
}
