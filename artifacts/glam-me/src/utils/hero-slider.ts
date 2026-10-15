import { isSafeAnnouncementLink, wrapIndex } from './announcement-slider.ts';
export { wrapIndex, swipeDirection } from './announcement-slider.ts';

export const HERO_INTERVAL_MS = 5500;
export const HERO_MOBILE_MAX_WIDTH = 767;

type Orderable = { id: number; displayOrder: number; enabled?: boolean };

/** Enabled slides in display order. Empty stays empty — no invented content. */
export function activeHeroSlides<T extends Orderable>(slides: readonly T[] | null | undefined): T[] {
  return (slides ?? []).filter((s) => s.enabled !== false).sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
}

export const isSafeHeroLink = isSafeAnnouncementLink;

export function heroTextPositionClass(position: string): 'left' | 'center' | 'right' {
  return position === 'center' || position === 'right' ? position : 'left';
}

export function shouldAutoplay(opts: { count: number; manualPaused: boolean; hover: boolean; focus: boolean; hidden: boolean; reducedMotion: boolean }): boolean {
  return opts.count > 1 && !opts.manualPaused && !opts.hover && !opts.focus && !opts.hidden && !opts.reducedMotion;
}

export function nextHeroIndex(index: number, delta: number, count: number): number {
  return wrapIndex(index + delta, count);
}
