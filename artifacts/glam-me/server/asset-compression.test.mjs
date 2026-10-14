import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { compressAsset } from './asset-compression.mjs';

const body = Buffer.from('const storefront = "Glam Too";\n'.repeat(400));
test('Brotli and gzip round-trip without altering assets', async () => {
  const br = await compressAsset(body, 'text/javascript', 'gzip, br', 'test-script');
  assert.equal(br.headers['Content-Encoding'], 'br');
  assert.deepEqual(brotliDecompressSync(br.body), body);
  assert.ok(br.body.length < body.length / 10);
  const gz = await compressAsset(body, 'text/css', 'gzip');
  assert.deepEqual(gunzipSync(gz.body), body);
  assert.equal(gz.headers.Vary, 'Accept-Encoding');
});
test('respects declined encodings and leaves images unchanged', async () => {
  const identity = await compressAsset(body, 'text/css', 'gzip;q=0, br;q=0');
  assert.deepEqual(identity.body, body);
  assert.equal(identity.headers['Content-Encoding'], undefined);
  const image = await compressAsset(body, 'image/webp', 'br');
  assert.deepEqual(image.body, body);
  assert.equal(image.headers['Content-Encoding'], undefined);
});
