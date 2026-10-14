import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { storefrontHeaders } from './security.mjs';

const key = `pk_test_${Buffer.from('tenant.example.clerk.accounts.dev$').toString('base64')}`;
const policy = (options = {}) => storefrontHeaders({ clerkKeys: [key], ...options })['Content-Security-Policy'];
const directive = (csp, name) => csp.split(';').map(value => value.trim()).find(value => value.startsWith(`${name} `));

test('production enforces every resource boundary and exact Clerk tenants', () => {
  const csp = policy();
  for (const name of ['default-src', 'script-src', 'connect-src', 'frame-src', 'style-src', 'img-src', 'font-src', 'media-src', 'worker-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']) assert.ok(directive(csp, name), name);
  assert.ok(directive(csp, 'script-src').includes('https://tenant.example.clerk.accounts.dev'));
  assert.doesNotMatch(csp, /https:\/\/\*\.clerk\.accounts\.dev|https:\/\/\*\.clerk\.com|fonts\.googleapis|fonts\.gstatic/);
  assert.doesNotMatch(directive(csp, 'script-src'), /'unsafe-inline'|'unsafe-eval'|\shttps:\s/);
  assert.match(directive(csp, 'connect-src'), /https:\/\/\*\.protect\.clerk\.com:\*/);
  assert.match(directive(csp, 'frame-src'), /https:\/\/hooks\.stripe\.com/);
  assert.match(directive(csp, 'frame-src'), /https:\/\/\*\.js\.stripe\.com/);
  assert.equal(directive(csp, 'object-src'), "object-src 'none'");
  assert.equal(directive(csp, 'form-action'), "form-action 'self'");
});
test('only exact initial script contents are hashed; development exceptions stay separate', () => {
  const script = 'window.bootstrap = true;';
  const hash = createHash('sha256').update(script).digest('base64');
  assert.ok(directive(policy({ html: `<script>${script}</script>` }), 'script-src').includes(`'sha256-${hash}'`));
  assert.ok(!policy().includes(`'sha256-${hash}'`));
  const dev = policy({ development: true });
  assert.match(directive(dev, 'script-src'), /'unsafe-eval'/);
  assert.match(directive(dev, 'connect-src'), /ws: wss:/);
  assert.match(directive(dev, 'frame-ancestors'), /https:\/\/replit\.com/);
  assert.doesNotMatch(policy(), /ws:|wss:|unsafe-eval|https:\/\/replit\.com/);
});
test('configured origins cannot inject directives and never use request Host', () => {
  assert.throws(() => policy({ siteOrigin: 'https://evil.test/path' }), /valid HTTPS/);
  assert.throws(() => policy({ clerkKeys: ['pk_test_bogus'] }), /Invalid Clerk/);
  const malicious = `pk_test_${Buffer.from("tenant.test; script-src *$").toString('base64')}`;
  assert.throws(() => policy({ clerkKeys: [malicious] }), /Invalid Clerk/);
  assert.ok(!policy().includes(key));
});
