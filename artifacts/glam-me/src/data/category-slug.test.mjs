import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategorySlug, getProductCategorySlug } from './category-slug.ts';

test('canonical category slugs survive a title change and resolve product category names', () => {
  const categories = [{ name: 'Evening Dresses', slug: 'the-evening-edit' }];
  assert.equal(getCategorySlug(categories[0]), 'the-evening-edit');
  assert.equal(getProductCategorySlug('Evening Dresses', categories), 'the-evening-edit');
});

test('only legacy categories without a slug derive URLs from their name', () => {
  const categories = [{ name: 'Co-Ords' }];
  assert.equal(getCategorySlug(categories[0]), 'co-ords');
  assert.equal(getProductCategorySlug('CO-ORDS', categories), 'co-ords');
  assert.equal(getProductCategorySlug('Unknown & New', categories), 'unknown-and-new');
});