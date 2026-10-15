import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createHeroSlide, deleteHeroSlide, updateHeroSlide, getGetAdminHeroSlidesQueryKey, getGetHeroSlidesQueryKey, useGetAdminHeroSlides,
  type HeroSlide, type HeroSlideList,
} from '@workspace/api-client-react';
import { MediaLibrary } from '@/components/MediaLibrary';
import { getCatalogMediaSource } from '@/data/catalog';
import { isSafeHeroLink } from '@/utils/hero-slider';

type Position = 'left' | 'center' | 'right';
type Draft = { desktopImage: string; mobileImage: string; heading: string; text: string; ctaText: string; ctaLink: string; altText: string; textPosition: Position; displayOrder: string; enabled: boolean };
type Notice = { kind: 'error' | 'conflict' | 'success'; message: string } | null;
type Field = 'desktopImage' | 'mobileImage';

const emptyDraft: Draft = { desktopImage: '', mobileImage: '', heading: '', text: '', ctaText: '', ctaLink: '', altText: '', textPosition: 'left', displayOrder: '0', enabled: true };
const toDraft = (s: HeroSlide): Draft => ({ desktopImage: s.desktopImage, mobileImage: s.mobileImage, heading: s.heading, text: s.text, ctaText: s.ctaText, ctaLink: s.ctaLink ?? '', altText: s.altText, textPosition: s.textPosition as Position, displayOrder: String(s.displayOrder), enabled: s.enabled });
const sameDraft = (a: Draft, b: Draft) => (Object.keys(a) as (keyof Draft)[]).every((k) => a[k] === b[k]);
const sortSlides = (l: HeroSlide[]) => [...l].sort((x, y) => x.displayOrder - y.displayOrder || x.id - y.id);

function validate(d: Draft) {
  const desktopImage = d.desktopImage.trim(); const mobileImage = d.mobileImage.trim();
  if (!desktopImage || !mobileImage) return { error: 'Choose both a desktop and a mobile image.' };
  if (desktopImage.length > 2048 || mobileImage.length > 2048) return { error: 'Image address is too long.' };
  if (d.heading.trim().length > 120) return { error: 'Heading can be up to 120 characters.' };
  if (d.text.trim().length > 320) return { error: 'Text can be up to 320 characters.' };
  if (d.ctaText.trim().length > 60) return { error: 'Button text can be up to 60 characters.' };
  const link = d.ctaLink.trim();
  if (link && !isSafeHeroLink(link)) return { error: 'Button link must start with / or https://.' };
  if (link && !d.ctaText.trim()) return { error: 'Add button text for the link, or clear the link.' };
  const alt = d.altText.trim();
  if (alt.length < 1 || alt.length > 240) return { error: 'Image description (alt text) is required, up to 240 characters.' };
  const order = Number(d.displayOrder);
  if (d.displayOrder.trim() === '' || !Number.isInteger(order) || order < 0 || order > 10000) return { error: 'Order must be a whole number from 0 to 10000.' };
  return { input: { desktopImage, mobileImage, heading: d.heading.trim(), text: d.text.trim(), ctaText: d.ctaText.trim(), ctaLink: link || null, altText: alt, textPosition: d.textPosition, displayOrder: order, enabled: d.enabled } };
}

function describeError(error: unknown): Notice {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: unknown }).status) : 0;
  if (status === 409) return { kind: 'conflict', message: 'Someone else changed this slide. Your draft is kept — reload to see the latest version, then reapply your edits.' };
  if (status === 404) return { kind: 'conflict', message: 'This slide was already deleted. Reload to refresh the list.' };
  if (status === 401 || status === 403) return { kind: 'error', message: 'Your admin session has expired or lacks permission. Sign in again — your draft is kept.' };
  if (status === 400) return { kind: 'error', message: 'The server rejected these values. Check images, link and text.' };
  if (status >= 500) return { kind: 'error', message: 'The server is unavailable right now. Your draft is kept — try again shortly.' };
  return { kind: 'error', message: 'Could not save. Check your connection and try again — your draft is kept.' };
}

async function uploadFile(original: File, maxEdge: number): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(original.type)) throw new Error('Use a JPG, PNG, WebP or AVIF image.');
  const url = URL.createObjectURL(original);
  let file: File;
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image optimisation is not available in this browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not optimise this image.')), 'image/webp', .84));
    file = new File([blob], `${original.name.replace(/\.[^.]*$/, '')}.${blob.type === 'image/webp' ? 'webp' : 'png'}`, { type: blob.type });
  } finally { URL.revokeObjectURL(url); }
  const res = await fetch('/api/storage/uploads/request-url', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || 'image/jpeg' }) });
  const up = await res.json() as { uploadURL?: string; objectPath?: string; error?: string };
  if (!res.ok || !up.uploadURL || !up.objectPath) throw new Error(up.error || 'Could not start the upload.');
  const put = await fetch(up.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
  if (!put.ok) throw new Error('The image could not be uploaded.');
  return up.objectPath;
}

function Editor({ idPrefix, draft, onChange, disabled, images, onUploaded }: { idPrefix: string; draft: Draft; onChange: (d: Draft) => void; disabled: boolean; images: string[]; onUploaded: (p: string) => void }) {
  const [picker, setPicker] = useState<Field | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const latest = useRef(draft); latest.current = draft;
  const set = (patch: Partial<Draft>) => onChange({ ...latest.current, ...patch });

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; const field = picker; e.target.value = '';
    if (!file || !field) return;
    if (!file.type.startsWith('image/')) { setUploadError('Please choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { setUploadError('Please choose an image smaller than 8MB.'); return; }
    setUploading(true); setUploadError('');
    try { const path = await uploadFile(file, field === 'mobileImage' ? 1200 : 2400); onUploaded(path); set({ [field]: path } as Partial<Draft>); setPicker(null); }
    catch (err) { setUploadError(err instanceof Error ? err.message : 'Upload failed.'); }
    finally { setUploading(false); }
  };

  const imageField = (field: Field, label: string) => {
    const src = draft[field] ? getCatalogMediaSource(draft[field]) || draft[field] : '';
    return (
      <div className="admin-hs-image">
        <span>{label}</span>
        <div className="admin-hs-preview">{src ? <img src={src} alt="" /> : <em>No image</em>}</div>
        <input type="text" aria-label={`${label} URL`} placeholder="/images/… or https://…" value={draft[field]} disabled={disabled} onChange={(e) => set({ [field]: e.target.value } as Partial<Draft>)} data-testid={`input-${idPrefix}-${field}`} />
        <button type="button" className="admin-secondary" disabled={disabled} onClick={() => { setUploadError(''); setPicker(field); }} data-testid={`button-${idPrefix}-pick-${field}`}>Choose or upload</button>
      </div>
    );
  };

  const t = (k: keyof Draft) => draft[k] as string;
  return (
    <div className="admin-hs-fields">
      <div className="admin-hs-images">{imageField('desktopImage', 'Desktop image')}{imageField('mobileImage', 'Mobile image')}</div>
      {uploadError && !picker && <p className="admin-ann-notice is-error" role="alert">{uploadError}</p>}
      <MediaLibrary isOpen={picker !== null} onClose={() => setPicker(null)} availableImages={images} isUploading={uploading} onUpload={handleUpload} onSelect={(sel) => { if (sel[0] && picker) set({ [picker]: sel[0] } as Partial<Draft>); setPicker(null); }} />
      {picker && uploadError && <p className="admin-hs-upload-error" role="alert">{uploadError}</p>}
      <label className="admin-ann-field" htmlFor={`${idPrefix}-heading`}><span>Heading <small>{t('heading').trim().length}/120</small></span><input id={`${idPrefix}-heading`} type="text" maxLength={140} value={t('heading')} disabled={disabled} onChange={(e) => set({ heading: e.target.value })} data-testid={`input-${idPrefix}-heading`} /></label>
      <label className="admin-ann-field" htmlFor={`${idPrefix}-text`}><span>Text <small>{t('text').trim().length}/320</small></span><textarea id={`${idPrefix}-text`} rows={2} maxLength={360} value={t('text')} disabled={disabled} onChange={(e) => set({ text: e.target.value })} data-testid={`input-${idPrefix}-text`} /></label>
      <div className="admin-hs-row">
        <label className="admin-ann-field" htmlFor={`${idPrefix}-ctatext`}><span>Button text</span><input id={`${idPrefix}-ctatext`} type="text" maxLength={80} value={t('ctaText')} disabled={disabled} onChange={(e) => set({ ctaText: e.target.value })} data-testid={`input-${idPrefix}-ctatext`} /></label>
        <label className="admin-ann-field" htmlFor={`${idPrefix}-ctalink`}><span>Button link <small>optional</small></span><input id={`${idPrefix}-ctalink`} type="text" inputMode="url" placeholder="/shop or https://…" value={t('ctaLink')} disabled={disabled} onChange={(e) => set({ ctaLink: e.target.value })} data-testid={`input-${idPrefix}-ctalink`} /></label>
      </div>
      <label className="admin-ann-field" htmlFor={`${idPrefix}-alt`}><span>Image description (alt text) <small>required · {t('altText').trim().length}/240</small></span><input id={`${idPrefix}-alt`} type="text" maxLength={260} value={t('altText')} disabled={disabled} onChange={(e) => set({ altText: e.target.value })} data-testid={`input-${idPrefix}-alt`} /></label>
      <div className="admin-hs-row">
        <label className="admin-ann-field" htmlFor={`${idPrefix}-pos`}><span>Text position</span>
          <select id={`${idPrefix}-pos`} value={draft.textPosition} disabled={disabled} onChange={(e) => set({ textPosition: e.target.value as Position })} data-testid={`select-${idPrefix}-position`}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>
        </label>
        <label className="admin-ann-field admin-ann-order" htmlFor={`${idPrefix}-order`}><span>Order</span><input id={`${idPrefix}-order`} type="number" min={0} max={10000} step={1} value={t('displayOrder')} disabled={disabled} onChange={(e) => set({ displayOrder: e.target.value })} data-testid={`input-${idPrefix}-order`} /></label>
        <label className="admin-ann-toggle" htmlFor={`${idPrefix}-enabled`}><input id={`${idPrefix}-enabled`} type="checkbox" checked={draft.enabled} disabled={disabled} onChange={(e) => set({ enabled: e.target.checked })} data-testid={`checkbox-${idPrefix}-enabled`} /><span>{draft.enabled ? 'Showing on site' : 'Hidden'}</span></label>
      </div>
    </div>
  );
}

function NoticeLine({ notice, onReload }: { notice: Notice; onReload?: () => void }) {
  if (!notice) return null;
  return (
    <div className={`admin-ann-notice is-${notice.kind}`} role={notice.kind === 'success' ? 'status' : 'alert'} data-testid="status-hero-notice">
      <span>{notice.message}</span>
      {notice.kind === 'conflict' && onReload && <button type="button" className="admin-secondary" onClick={onReload} data-testid="button-hero-reload">Reload latest</button>}
    </div>
  );
}

function SlideRow({ item, images, onUploaded, onWritten, onReload }: { item: HeroSlide; images: string[]; onUploaded: (p: string) => void; onWritten: () => void; onReload: (id: number) => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | 'toggle' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const base = useRef({ revision: item.revision, draft: toDraft(item) });
  const queryClient = useQueryClient();
  const dirty = !sameDraft(draft, base.current.draft);
  useEffect(() => {
    if (item.revision === base.current.revision || dirty) return;
    const fresh = toDraft(item);
    base.current = { revision: item.revision, draft: fresh };
    setDraft(fresh);
  }, [item.revision, dirty]);

  const save = async (next: Draft, kind: 'save' | 'toggle') => {
    const { input, error } = validate(next);
    if (!input) { setNotice({ kind: 'error', message: error! }); return; }
    setBusy(kind); setNotice(null);
    try {
      const saved = await updateHeroSlide(item.id, { ...input, expectedRevision: base.current.revision });
      base.current = { revision: saved.revision, draft: toDraft(saved) };
      setDraft(toDraft(saved));
      queryClient.setQueryData<HeroSlideList>(getGetAdminHeroSlidesQueryKey(), (old) => old ? { slides: sortSlides(old.slides.map((s) => s.id === saved.id ? saved : s)) } : old);
      onWritten();
      setNotice({ kind: 'success', message: kind === 'toggle' ? (saved.enabled ? 'Now showing on the site.' : 'Hidden from the site.') : 'Saved.' });
    } catch (err) { setDraft(next); setNotice(describeError(err)); }
    finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy('delete'); setNotice(null);
    try {
      await deleteHeroSlide(item.id, { expectedRevision: base.current.revision });
      queryClient.setQueryData<HeroSlideList>(getGetAdminHeroSlidesQueryKey(), (old) => old ? { slides: old.slides.filter((s) => s.id !== item.id) } : old);
      onWritten();
    } catch (err) { setConfirming(false); setNotice(describeError(err)); setBusy(null); }
  };
  return (
    <li className={`admin-ann-row admin-hs-row-item${item.enabled ? '' : ' is-disabled'}`} data-testid={`row-hero-slide-${item.id}`}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void save(draft, 'save'); }}>
        <div className="admin-ann-row-head">
          <span className={`admin-ann-pill${item.enabled ? ' is-live' : ''}`}>{item.enabled ? 'Live' : 'Hidden'}</span>
          <span className="admin-ann-meta">#{item.id} · order {item.displayOrder}{dirty ? ' · unsaved changes' : ''}</span>
        </div>
        <Editor idPrefix={`hero-${item.id}`} draft={draft} onChange={setDraft} disabled={busy !== null} images={images} onUploaded={onUploaded} />
        <NoticeLine notice={notice} onReload={() => void onReload(item.id)} />
        <div className="admin-ann-actions">
          <button className="admin-primary" type="submit" disabled={busy !== null || !dirty} data-testid={`button-save-hero-${item.id}`}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          {dirty && <button className="admin-secondary" type="button" disabled={busy !== null} onClick={() => { setDraft(base.current.draft); setNotice(null); }} data-testid={`button-discard-hero-${item.id}`}>Discard</button>}
          {!dirty && <button className="admin-secondary" type="button" disabled={busy !== null} onClick={() => void save({ ...draft, enabled: !draft.enabled }, 'toggle')} data-testid={`button-toggle-hero-${item.id}`}>{busy === 'toggle' ? 'Updating…' : item.enabled ? 'Disable' : 'Enable'}</button>}
          <span className="admin-ann-spacer" />
          {confirming ? (
            <span className="admin-ann-confirm" role="group" aria-label="Confirm delete">
              <span>Delete this slide?</span>
              <button className="admin-danger-button" type="button" disabled={busy !== null} onClick={() => void remove()} data-testid={`button-confirm-delete-hero-${item.id}`}>{busy === 'delete' ? 'Deleting…' : 'Yes, delete'}</button>
              <button className="admin-secondary" type="button" disabled={busy !== null} onClick={() => setConfirming(false)} data-testid={`button-cancel-delete-hero-${item.id}`}>Keep</button>
            </span>
          ) : <button className="admin-danger-button" type="button" disabled={busy !== null} onClick={() => setConfirming(true)} data-testid={`button-delete-hero-${item.id}`}>Delete</button>}
        </div>
      </form>
    </li>
  );
}

export default function AdminHeroSlides({ availableImages }: { availableImages: string[] }) {
  const queryClient = useQueryClient();
  const query = useGetAdminHeroSlides({ query: { queryKey: getGetAdminHeroSlidesQueryKey(), refetchOnWindowFocus: false } });
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [newNotice, setNewNotice] = useState<Notice>(null);
  const [creating, setCreating] = useState(false);
  const [rowKeys, setRowKeys] = useState<Record<number, number>>({});
  const [uploaded, setUploaded] = useState<string[]>([]);
  const items = query.data?.slides ?? [];
  const images = [...new Set([...uploaded, ...items.flatMap((s) => [s.desktopImage, s.mobileImage]), ...availableImages])];
  const addUploaded = (p: string) => setUploaded((u) => (u.includes(p) ? u : [p, ...u]));
  const refreshPublic = () => { void queryClient.invalidateQueries({ queryKey: getGetHeroSlidesQueryKey() }); };
  // Remount the row only after a successful refetch so a failed reload keeps the draft.
  const reloadRow = async (id: number) => {
    const result = await query.refetch();
    if (result.isError || result.error) return;
    setRowKeys((k) => ({ ...k, [id]: (k[id] ?? 0) + 1 }));
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const { input, error } = validate(newDraft);
    if (!input) { setNewNotice({ kind: 'error', message: error! }); return; }
    setCreating(true); setNewNotice(null);
    try {
      const created = await createHeroSlide(input);
      queryClient.setQueryData<HeroSlideList>(getGetAdminHeroSlidesQueryKey(), (old) => ({ slides: sortSlides([...(old?.slides ?? []), created]) }));
      refreshPublic();
      setNewDraft({ ...emptyDraft, displayOrder: String(Math.min(10000, created.displayOrder + 10)) });
      setNewNotice({ kind: 'success', message: 'Slide added.' });
    } catch (err) { setNewNotice(describeError(err)); }
    finally { setCreating(false); }
  };

  const live = items.filter((s) => s.enabled).length;
  return (
    <>
      <div className="admin-section-title">
        <div>
          <p className="admin-eyebrow">Storefront</p>
          <h1>Hero Slides</h1>
          <p>The full-width banner under the header. Each slide needs a desktop and a mobile image. With no enabled slides the banner is hidden.</p>
        </div>
        <button className="admin-secondary" type="button" onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-hero">{query.isFetching ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <section className="admin-panel admin-ann-new" aria-labelledby="admin-hs-new-title">
        <h2 id="admin-hs-new-title">New slide</h2>
        <form onSubmit={create}>
          <Editor idPrefix="hero-new" draft={newDraft} onChange={setNewDraft} disabled={creating} images={images} onUploaded={addUploaded} />
          <NoticeLine notice={newNotice} onReload={() => void query.refetch()} />
          <div className="admin-ann-actions"><button className="admin-primary" type="submit" disabled={creating} data-testid="button-create-hero">{creating ? 'Adding…' : 'Add slide'}</button></div>
        </form>
      </section>
      <section className="admin-panel admin-ann-list" aria-labelledby="admin-hs-list-title">
        <div className="admin-ann-list-head">
          <h2 id="admin-hs-list-title">All slides</h2>
          {query.data && <span className="admin-muted-count" data-testid="text-hero-count">{live} live · {items.length} total</span>}
        </div>
        {query.isLoading ? (
          <ul className="admin-ann-rows" aria-busy="true">{[0, 1].map((i) => <li key={i} className="admin-ann-skeleton" />)}</ul>
        ) : query.isError && !query.data ? (
          <div className="admin-ann-notice is-error" role="alert"><span>Hero slides could not be loaded.</span><button type="button" className="admin-secondary" onClick={() => void query.refetch()} data-testid="button-retry-hero">Try again</button></div>
        ) : items.length === 0 ? (
          <div className="admin-ann-empty" data-testid="status-hero-empty"><p><strong>No slides yet.</strong></p><p>The banner stays hidden on the storefront until you add and enable one.</p></div>
        ) : (
          <ul className="admin-ann-rows">{items.map((item) => <SlideRow key={`${item.id}-${rowKeys[item.id] ?? 0}`} item={item} images={images} onUploaded={addUploaded} onWritten={refreshPublic} onReload={reloadRow} />)}</ul>
        )}
      </section>
    </>
  );
}
