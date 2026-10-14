import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { serializeStructuredData } from './structured.mjs';

// Exercise the real RouteSeo effect and head updates with controlled network and
// DOM primitives. The fresh-context browser pass is documented in security-policy.md.
test('browser metadata stays noindex, removes stale tags, and ignores obsolete responses', async () => {
  const children = [];
  const head = {
    appendChild(node) { children.push(node); },
    querySelectorAll(selector) {
      const selectors = selector.split(',').map((value) => value.trim());
      return children.filter((node) => selectors.some((value) =>
        value === '[data-route-seo]' ? node.attrs.has('data-route-seo') :
          value === 'title' ? node.tag === 'title' :
            value === 'meta[name="robots"]' && node.tag === 'meta' && node.attrs.get('name') === 'robots'));
    },
  };
  const document = {
    head,
    createElement(tag) {
      return { tag, attrs: new Map(), textContent: '', type: '',
        setAttribute(key, value) { this.attrs.set(key, value); },
        remove() { const index = children.indexOf(this); if (index >= 0) children.splice(index, 1); } };
    },
  };
  const addInitial = (tag, attrs, text = '') => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    node.textContent = text;
    head.appendChild(node);
  };
  addInitial('title', {}, 'Static title');
  addInitial('meta', { name: 'robots', content: 'noindex, follow', 'data-route-seo': '' });
  let location = '/product/dress';
  let search = '';
  let cleanup;
  const ref = { current: null };
  const requests = [];
  const navigations = [];
  const navigate = (path, options) => navigations.push({ path, options });
  const module = { exports: {} };
  const source = (await readFile(new URL('../src/components/RouteSeo.tsx', import.meta.url), 'utf8'))
    .replace('import.meta.env.BASE_URL', '"/"');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports, document, AbortController,
    fetch(url, options) { return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })); },
    require(name) {
      if (name === 'react') return {
        useEffect(effect) { cleanup = effect(); },
        useRef() { return ref; },
      };
      if (name === 'wouter') return { useLocation: () => [location, navigate], useSearch: () => search };
      if (name.endsWith('structured.mjs')) return { serializeStructuredData };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const render = (path, query = '') => { cleanup?.(); location = path; search = query; module.exports.default(); };
  const settle = async (data, index = requests.length - 1) => {
    requests[index].resolve({ ok: true, json: async () => data });
    await new Promise(setImmediate);
  };
  const meta = (key, value) => children.filter((node) => node.tag === 'meta' && node.attrs.get(key) === value);
  const assertNoindex = (expected = 'noindex, follow') => {
    const robots = meta('name', 'robots');
    assert.equal(robots.length, 1);
    assert.equal(robots[0].attrs.get('content'), expected);
  };
  const schema = () => children.filter((node) => node.tag === 'script' && node.type === 'application/ld+json');
  render('/product/dress');
  assertNoindex();
  const product = { status: 200, title: 'Dress | Glam Too', type: 'product', robots: 'index, follow',
    canonicalUrl: 'https://example.test/product/dress', image: 'https://example.test/dress.jpg',
    structuredData: { '@context': 'https://schema.org', '@type': 'Product', name: '</script><script>bad</script>' } };
  await settle(product);
  assertNoindex();
  assert.equal(children.filter((node) => node.tag === 'title').length, 1);
  assert.deepEqual(JSON.parse(schema()[0].textContent), product.structuredData);
  assert.equal(meta('property', 'og:image')[0].attrs.get('content'), product.image);
  render('/shop', 'page=2');
  assertNoindex();
  assert.equal(schema().length, 0, 'stale schema removed before network settles');
  assert.equal(meta('property', 'og:image').length, 0);
  assert.equal(meta('name', 'twitter:image').length, 0);
  assert.equal(requests.at(-1).url, '/api/seo/resolve?path=%2Fshop%3Fpage%3D2');
  const obsoleteIndex = requests.length - 1;
  render('/');
  await settle(product, obsoleteIndex);
  assert.equal(schema().length, 0, 'aborted response cannot restore old product tags');
  await settle({ status: 200, title: 'Home', type: 'website', image: 'https://example.test/social-home.webp', canonicalUrl: 'https://example.test/' });
  assertNoindex();
  assert.equal(meta('property', 'og:image')[0].attrs.get('content'), 'https://example.test/social-home.webp');
  assert.equal(meta('name', 'twitter:card')[0].attrs.get('content'), 'summary_large_image');
  render('/missing');
  await settle({ status: 404, title: 'Not found', type: 'website' });
  assertNoindex('noindex, nofollow');
  assert.equal(meta('property', 'og:image').length, 0);
  render('/broken');
  requests.at(-1).reject(new Error('offline'));
  await new Promise(setImmediate);
  assertNoindex('noindex, nofollow');
  assert.equal(schema().length, 0);
  render('/product/7');
  await settle({ status: 301, location: '/product/dress' });
  assert.equal(navigations[0].path, '/product/dress');
  assert.equal(navigations[0].options.replace, true);
  assertNoindex();
});
