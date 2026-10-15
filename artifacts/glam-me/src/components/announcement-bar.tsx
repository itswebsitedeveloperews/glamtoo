import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useGetAnnouncements, getGetAnnouncementsQueryKey, type Announcement, type AnnouncementList } from '@workspace/api-client-react';
import { PublicSnapshotContext } from '@/data/public-snapshot';
import { ANNOUNCEMENT_INTERVAL_MS, DESKTOP_MIN_WIDTH, groupAnnouncements, isSafeAnnouncementLink, perViewForWidth, swipeDirection, wrapIndex } from '@/utils/announcement-slider';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const HEIGHT_VAR = '--announcement-bar-height';

function setBarHeight(px: number) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(HEIGHT_VAR, `${Math.round(px)}px`);
}

function usePerView() {
  const [perView, setPerView] = useState(1);
  useIsoLayoutEffect(() => {
    const query = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const update = () => setPerView(perViewForWidth(query.matches ? DESKTOP_MIN_WIDTH : 0));
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return perView;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function AnnouncementMessage({ item, tabbable }: { item: Announcement; tabbable: boolean }) {
  const text = <span className="announcement-text">{item.text}</span>;
  if (!isSafeAnnouncementLink(item.link)) return <p className="announcement-item" data-testid={`text-announcement-${item.id}`}>{text}</p>;
  const external = item.link.startsWith('https:');
  return (
    <p className="announcement-item">
      <a href={item.link} tabIndex={tabbable ? undefined : -1} {...(external ? { rel: 'noopener noreferrer' } : {})} data-testid={`link-announcement-${item.id}`}>{text}</a>
    </p>
  );
}

export default function AnnouncementBar() {
  const snapshot = useContext(PublicSnapshotContext);
  const snapshotAnnouncements = snapshot?.announcements;
  const query = useGetAnnouncements({
    query: {
      queryKey: getGetAnnouncementsQueryKey(),
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      ...(snapshotAnnouncements !== undefined ? { initialData: { announcements: snapshotAnnouncements } as AnnouncementList } : {}),
    },
    request: { credentials: 'omit' },
  });
  const items = useMemo(() => (query.data?.announcements ?? []).filter((a) => a.enabled !== false), [query.data]);
  const perView = usePerView();
  const groups = useMemo(() => groupAnnouncements(items, perView), [items, perView]);
  const count = groups.length;
  const reducedMotion = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [docHidden, setDocHidden] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);

  // Reduced motion: no autoplay by default.
  useEffect(() => { if (reducedMotion) setManualPaused(true); }, [reducedMotion]);
  useEffect(() => { setIndex((i) => wrapIndex(i, count)); }, [count]);
  useEffect(() => {
    const update = () => setDocHidden(document.visibilityState === 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const paused = manualPaused || hoverPaused || focusPaused || docHidden;
  useEffect(() => {
    if (count <= 1 || paused) return;
    const timer = window.setInterval(() => { setAnnounce(false); setIndex((i) => wrapIndex(i + 1, count)); }, ANNOUNCEMENT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  const go = useCallback((delta: number) => {
    setManualPaused(true);
    setAnnounce(true);
    setIndex((i) => wrapIndex(i + delta, count));
  }, [count]);

  const hasBar = count > 0;
  useIsoLayoutEffect(() => {
    const node = barRef.current;
    if (!hasBar || !node) { setBarHeight(0); return; }
    setBarHeight(node.getBoundingClientRect().height);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setBarHeight(node.getBoundingClientRect().height));
    observer.observe(node);
    return () => { observer.disconnect(); setBarHeight(0); };
  }, [hasBar]);

  if (!hasBar) return null;

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse' || count <= 1) return;
    pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    suppressClick.current = false;
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dir = swipeDirection(event.clientX - start.x, event.clientY - start.y);
    if (dir !== 0) { suppressClick.current = true; go(dir); window.setTimeout(() => { suppressClick.current = false; }, 400); }
  };

  const multi = count > 1;
  return (
    <div
      ref={barRef}
      className={`announcement-bar${multi ? ' has-controls' : ''}${reducedMotion ? ' is-reduced' : ''}`}
      role="region"
      aria-roledescription={multi ? 'carousel' : undefined}
      aria-label="Store announcements"
      data-testid="announcement-bar"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setFocusPaused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusPaused(false); }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { pointerStart.current = null; }}
      onTouchStart={() => { if (multi) setManualPaused(true); }}
      onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
    >
      <div className="announcement-inner">
        {multi && (
          <button type="button" className="announcement-control announcement-prev" aria-label="Previous announcement" onClick={() => go(-1)} data-testid="button-announcement-prev">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
          </button>
        )}
        <div className="announcement-viewport" aria-live={announce ? 'polite' : 'off'} aria-atomic="true">
          {groups.map((group, groupIndex) => {
            const active = groupIndex === index;
            return (
              <div
                key={group.map((a) => a.id).join('-')}
                className={`announcement-slide${active ? ' is-active' : ''}`}
                style={{ ['--announcement-cols' as string]: String(group.length) }}
                aria-hidden={active ? undefined : true}
                role={multi ? 'group' : undefined}
                aria-roledescription={multi ? 'slide' : undefined}
                aria-label={multi ? `${groupIndex + 1} of ${count}` : undefined}
                data-testid={`slide-announcement-${groupIndex}`}
              >
                {group.map((item) => <AnnouncementMessage key={item.id} item={item} tabbable={active} />)}
              </div>
            );
          })}
        </div>
        {multi && (
          <div className="announcement-actions">
            <button type="button" className="announcement-control" aria-label={manualPaused ? 'Play announcements' : 'Pause announcements'} aria-pressed={manualPaused ? false : true} onClick={() => { setManualPaused((p) => !p); setAnnounce(false); }} data-testid="button-announcement-toggle">
              {manualPaused
                ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" className="is-fill" /></svg>
                : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5v9M10.5 3.5v9" /></svg>}
            </button>
            <button type="button" className="announcement-control announcement-next" aria-label="Next announcement" onClick={() => go(1)} data-testid="button-announcement-next">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
