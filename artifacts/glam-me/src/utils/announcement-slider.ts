export const ANNOUNCEMENT_INTERVAL_MS = 4500;
export const SWIPE_THRESHOLD_PX = 40;
export const DESKTOP_MIN_WIDTH = 1024;

export function perViewForWidth(width: number): number {
  return width >= DESKTOP_MIN_WIDTH ? 3 : 1;
}

export function groupAnnouncements<T>(items: readonly T[], perView: number): T[][] {
  const size = Math.max(1, Math.floor(perView));
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/** Returns -1/1 for an intentional horizontal swipe, 0 otherwise (vertical scrolls are ignored). */
export function swipeDirection(dx: number, dy: number, threshold = SWIPE_THRESHOLD_PX): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

export function isSafeAnnouncementLink(link: string | null | undefined): link is string {
  if (!link || /[\u0000-\u0020\u007f\\]/.test(link) || link.startsWith('//')) return false;
  if (link.startsWith('/')) return true;
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && !url.username && !url.password
      && !/(?:^|\.)(?:replit\.dev|localhost|local|internal)$/.test(url.hostname);
  } catch { return false; }
}
