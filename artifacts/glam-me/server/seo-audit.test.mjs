import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectSeo } from './seo.mjs';

test('legacy metadata is replaced and public graphs render once', () => {
  const shell = '<html><head><title>Old</title><meta name="description" content="Generic"><meta name="robots" content="index"><link rel="canonical" href="https://old.test"><meta property="og:title" content="Old"><meta name="twitter:title" content="Old"></head></html>';
  const page = { title: 'About Glam Too', description: 'About our boutique', canonicalUrl: 'https://glamtoo.webdesignessex.io/about', type: 'website', structuredData: { '@context': 'https://schema.org', '@graph': [{ '@type': 'AboutPage' }] } };
  const html = injectSeo(injectSeo(shell, page), page);
  for (const expression of [/<title\b/g, /name="description"/g, /name="robots"/g, /rel="canonical"/g, /property="og:title"/g, /name="twitter:title"/g, /type="application\/ld\+json"/g]) assert.equal((html.match(expression) || []).length, 1);
  assert.doesNotMatch(html, /Generic|old\.test/);
  const missing = injectSeo(html, { title: 'Page not found', robots: 'noindex, nofollow' });
  assert.match(missing, /noindex, nofollow/);
  assert.doesNotMatch(missing, /rel="canonical"|application\/ld\+json/);
});
test('auth introductions no longer duplicate Clerk headings or hide dynamic instructions', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  for (const name of ['CustomerSignInContent', 'CustomerSignUpPage']) {
    const section = app.split(`function ${name}()`)[1].split('\nfunction ')[0];
    assert.doesNotMatch(section, /<h1\b|customer-signin-title|headerTitle:\s*\{\s*display:\s*['"]none/);
  }
  assert.doesNotMatch(css, /\.cl-headerTitle\s*\{\s*visibility:\s*hidden/);
});
