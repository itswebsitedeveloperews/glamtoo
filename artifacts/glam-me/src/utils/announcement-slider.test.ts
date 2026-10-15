import test from 'node:test';
import assert from 'node:assert/strict';
import { groupAnnouncements, wrapIndex, swipeDirection, perViewForWidth, isSafeAnnouncementLink } from './announcement-slider.ts';

test('groups by per-view size', () => {
  assert.deepEqual(groupAnnouncements([1, 2, 3, 4], 3), [[1, 2, 3], [4]]);
  assert.deepEqual(groupAnnouncements([], 3), []);
  assert.deepEqual(groupAnnouncements([1, 2], 1), [[1], [2]]);
});
test('wraps indexes', () => {
  assert.equal(wrapIndex(-1, 3), 2);
  assert.equal(wrapIndex(3, 3), 0);
  assert.equal(wrapIndex(5, 0), 0);
});
test('swipe threshold ignores vertical scroll', () => {
  assert.equal(swipeDirection(-50, 10), 1);
  assert.equal(swipeDirection(50, 10), -1);
  assert.equal(swipeDirection(30, 0), 0);
  assert.equal(swipeDirection(50, 80), 0);
});
test('breakpoint', () => {
  assert.equal(perViewForWidth(1024), 3);
  assert.equal(perViewForWidth(1023), 1);
});
test('safe links', () => {
  assert.ok(isSafeAnnouncementLink('/shop'));
  assert.ok(isSafeAnnouncementLink('https://example.com'));
  assert.ok(!isSafeAnnouncementLink('//evil.com'));
  assert.ok(!isSafeAnnouncementLink('javascript:alert(1)'));
  assert.ok(!isSafeAnnouncementLink('http://x.com'));
});
