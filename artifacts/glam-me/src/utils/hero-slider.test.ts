import test from 'node:test';
import assert from 'node:assert/strict';
import { activeHeroSlides, heroTextPositionClass, isSafeHeroLink, nextHeroIndex, shouldAutoplay, HERO_INTERVAL_MS } from './hero-slider.ts';

test('filters disabled and sorts by order then id', () => {
  const out = activeHeroSlides([{ id: 3, displayOrder: 1, enabled: true }, { id: 1, displayOrder: 5, enabled: true }, { id: 2, displayOrder: 0, enabled: false }, { id: 0, displayOrder: 1, enabled: true }]);
  assert.deepEqual(out.map((s) => s.id), [0, 3, 1]);
  assert.deepEqual(activeHeroSlides(undefined), []);
});
test('autoplay rules', () => {
  const base = { count: 2, manualPaused: false, hover: false, focus: false, hidden: false, reducedMotion: false };
  assert.equal(shouldAutoplay(base), true);
  assert.equal(shouldAutoplay({ ...base, count: 1 }), false);
  for (const k of ['manualPaused', 'hover', 'focus', 'hidden', 'reducedMotion'] as const) assert.equal(shouldAutoplay({ ...base, [k]: true }), false);
  assert.equal(HERO_INTERVAL_MS, 5500);
});
test('wraps and validates', () => {
  assert.equal(nextHeroIndex(0, -1, 3), 2);
  assert.equal(nextHeroIndex(2, 1, 3), 0);
  assert.equal(heroTextPositionClass('bogus'), 'left');
  assert.equal(heroTextPositionClass('right'), 'right');
  assert.equal(isSafeHeroLink('javascript:alert(1)'), false);
  assert.equal(isSafeHeroLink('/shop'), true);
});
