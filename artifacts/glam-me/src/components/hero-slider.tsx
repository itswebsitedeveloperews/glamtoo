import { useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useGetHeroSlides, getGetHeroSlidesQueryKey, type HeroSlide, type HeroSlideList } from '@workspace/api-client-react';
import { PublicSnapshotContext } from '@/data/public-snapshot';
import { getCatalogMediaSource } from '@/data/catalog';
import { responsiveImage } from '@/utils/responsive-images';
import { activeHeroSlides, heroTextPositionClass, HERO_INTERVAL_MS, HERO_MOBILE_MAX_WIDTH, isSafeHeroLink, nextHeroIndex, shouldAutoplay, swipeDirection } from '@/utils/hero-slider';

const mediaSrc = (value: string) => getCatalogMediaSource(value) || value;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return reduced;
}

function Slide({ slide, index, active, first }: { slide: HeroSlide; index: number; active: boolean; first: boolean }) {
  const desktop = responsiveImage(mediaSrc(slide.desktopImage));
  const mobile = responsiveImage(mediaSrc(slide.mobileImage));
  const link = isSafeHeroLink(slide.ctaLink) && slide.ctaText ? slide.ctaLink : null;
  const Heading = first ? 'h1' : 'h2';
  const inertProps = { inert: !active };
  return (
    <div className={`glam-hs-slide is-${heroTextPositionClass(slide.textPosition)}${active ? ' is-active' : ''}`} role="group" aria-roledescription="slide" aria-label={`Slide ${index + 1}`} aria-hidden={active ? undefined : true} {...inertProps} data-testid={`hero-slide-${slide.id}`}>
      <picture>
        <source media={`(max-width: ${HERO_MOBILE_MAX_WIDTH}px)`} srcSet={mobile.srcSet ?? mobile.src} sizes="100vw" />
        <source media={`(min-width: ${HERO_MOBILE_MAX_WIDTH + 1}px)`} srcSet={desktop.srcSet ?? desktop.src} sizes="100vw" />
        <img className="glam-hs-img" src={desktop.src} alt={slide.altText} loading={first ? 'eager' : 'lazy'} decoding="async" {...(first ? { fetchPriority: 'high' as const } : {})} />
      </picture>
      {(slide.heading || slide.text || link) && (
        <div className="glam-hs-copy">
          {slide.heading && <Heading>{slide.heading}</Heading>}
          {slide.text && <p>{slide.text}</p>}
          {link && <a className="button button-pink" href={link} tabIndex={active ? undefined : -1} {...(link.startsWith('https:') ? { rel: 'noopener noreferrer' } : {})} data-testid={`link-hero-cta-${slide.id}`}>{slide.ctaText}</a>}
        </div>
      )}
    </div>
  );
}

export default function HeroSlider() {
  const snapshot = useContext(PublicSnapshotContext);
  const snap = snapshot?.heroSlides;
  const query = useGetHeroSlides({
    query: {
      queryKey: getGetHeroSlidesQueryKey(),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 2,
      ...(snap !== undefined ? { initialData: { slides: snap } as HeroSlideList } : {}),
    },
    request: { credentials: 'omit' },
  });
  const slides = useMemo(() => activeHeroSlides(query.data?.slides), [query.data]);
  const count = slides.length;
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const [explicitPlay, setExplicitPlay] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppress = useRef(false);

  useEffect(() => { if (reduced) { setManualPaused(true); setExplicitPlay(false); } }, [reduced]);
  useEffect(() => { setIndex((i) => (count ? Math.min(i, count - 1) : 0)); }, [count]);
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const playing = shouldAutoplay({ count, manualPaused, hover, focus, hidden, reducedMotion: reduced && !explicitPlay });
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setIndex((i) => nextHeroIndex(i, 1, count)), HERO_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [playing, count, index]);
  const go = useCallback((d: number) => { setManualPaused(true); setIndex((i) => nextHeroIndex(i, d, count)); }, [count]);

  if (count === 0) {
    if (query.isError && !query.data) {
      return (
        <section className="glam-hs glam-hs-status" aria-label="Homepage banner" data-testid="hero-error">
          <p>The banner could not be loaded.</p>
          <button type="button" className="button" onClick={() => void query.refetch()} data-testid="button-hero-retry">Try again</button>
        </section>
      );
    }
    if (query.isLoading) return <section className="glam-hs glam-hs-status is-loading" aria-label="Homepage banner" aria-busy="true" data-testid="hero-loading" />;
    return null;
  }

  const multi = count > 1;
  const onDown = (e: ReactPointerEvent) => { if (e.pointerType === 'mouse' || !multi) return; start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; suppress.current = false; };
  const onUp = (e: ReactPointerEvent) => {
    const s = start.current; start.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dir = swipeDirection(e.clientX - s.x, e.clientY - s.y);
    if (dir !== 0) { suppress.current = true; go(dir); window.setTimeout(() => { suppress.current = false; }, 400); }
  };
  return (
    <section
      className={`glam-hs${reduced ? ' is-reduced' : ''}`}
      role="region" aria-roledescription={multi ? 'carousel' : undefined} aria-label="Homepage banner" data-testid="hero-slider"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false); }}
      onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { start.current = null; }}
      onTouchStart={() => { if (multi) setManualPaused(true); }}
      onClickCapture={(e) => { if (suppress.current) { e.preventDefault(); e.stopPropagation(); suppress.current = false; } }}
    >
      <div className="glam-hs-stage" aria-live={playing ? 'off' : 'polite'}>
        {slides.map((s, i) => <Slide key={s.id} slide={s} index={i} active={i === index} first={i === 0} />)}
      </div>
      {multi && (
        <>
          <button type="button" className="glam-hs-arrow is-prev" aria-label="Previous slide" onClick={() => go(-1)} data-testid="button-hero-prev"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg></button>
          <button type="button" className="glam-hs-arrow is-next" aria-label="Next slide" onClick={() => go(1)} data-testid="button-hero-next"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg></button>
          <div className="glam-hs-controls">
            <button type="button" className="glam-hs-toggle" aria-label={manualPaused ? 'Play slideshow' : 'Pause slideshow'} aria-pressed={!manualPaused} onClick={() => { if (manualPaused) setExplicitPlay(true); setManualPaused((p) => !p); }} data-testid="button-hero-toggle">
              {manualPaused ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" fill="currentColor" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5v9M10.5 3.5v9" /></svg>}
            </button>
            <div className="glam-hs-dots">
              {slides.map((s, i) => <button key={s.id} type="button" className={`glam-hs-dot${i === index ? ' is-active' : ''}`} aria-label={`Go to slide ${i + 1}`} aria-current={i === index ? 'true' : undefined} onClick={() => { setManualPaused(true); setIndex(i); }} data-testid={`button-hero-dot-${i}`} />)}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
