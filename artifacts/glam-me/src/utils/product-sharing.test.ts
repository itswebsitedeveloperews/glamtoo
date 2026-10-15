import test from "node:test";
import assert from "node:assert/strict";
import { copyProductShareLink, nativeProductShare, productShareLinks, publicShareUrl, resolveProductShare } from "./product-sharing.ts";

const path = "/product/pearl-rose-bag";
const url = `https://glamtoo.webdesignessex.io${path}`;
const image = "https://glamtoo.webdesignessex.io/objects/uploads/primary-bag";
const title = "Pearl & Rose Bag — Pink";
const metadata = { status: 200, type: "product", canonicalUrl: url, image };

test("sharing uses the canonical product identity and primary public image", () => {
  assert.deepEqual(resolveProductShare(metadata, title, path), { title, url, image });
});

test("development, local and unsafe URLs cannot become sharing links or images", () => {
  for (const value of [
    "https://project.janeway.replit.dev/product/bag",
    "https://project.replit.dev./product/bag", "https://project.repl.co/product/bag",
    "http://glamtoo.webdesignessex.io/product/bag", "https://localhost/product/bag",
    "https://127.0.0.1/product/bag", "https://[::1]/product/bag", "https://server.internal/product/bag",
    "https://secret@glamtoo.webdesignessex.io/product/bag", "javascript:alert(1)", "blob:example", "/product/bag",
  ]) {
    assert.equal(publicShareUrl(value), null, value);
    assert.throws(() => resolveProductShare({ ...metadata, canonicalUrl: value }, title, path));
    assert.equal(resolveProductShare({ ...metadata, image: value }, title, path).image, undefined);
  }
});

test("stale metadata, failed responses and tracking URLs are never silently substituted", () => {
  for (const changed of [
    { canonicalUrl: `${url}-different` }, { canonicalUrl: `${url}?preview=true` },
    { canonicalUrl: `${url}#private` }, { status: 404 }, { status: 301 }, { type: "website" },
  ]) assert.throws(() => resolveProductShare({ ...metadata, ...changed }, title, path));
  assert.throws(() => resolveProductShare(null, title, path));
});

test("fallback destinations preserve special characters, title, canonical URL and Pinterest image", () => {
  const links = productShareLinks(resolveProductShare(metadata, title, path));
  assert.equal(new URL(links.facebook).searchParams.get("u"), url);
  assert.equal(new URL(links.facebook).searchParams.get("quote"), title);
  assert.equal(new URL(links.whatsapp).searchParams.get("text"), `${title}\n${url}`);
  const pin = new URL(links.pinterest!);
  assert.equal(pin.searchParams.get("url"), url);
  assert.equal(pin.searchParams.get("description"), title);
  assert.equal(pin.searchParams.get("media"), image);
  assert.equal(productShareLinks({ title, url }).pinterest, undefined);
});

test("native sharing receives the correct product payload", async () => {
  let payload;
  assert.equal(await nativeProductShare({ title, url, image }, {
    canShare: data => data.url === url,
    share: async data => { payload = data; },
  }), "shared");
  assert.deepEqual(payload, { title, text: title, url });
});

test("copy writes exactly the canonical URL and never reports permission failures as success", async () => {
  let copied = "";
  await copyProductShareLink({ title, url }, { writeText: async text => { copied = text; } });
  assert.equal(copied, url);
  await assert.rejects(copyProductShareLink({ title, url }));
  await assert.rejects(copyProductShareLink({ title, url }, { writeText: async () => { throw new Error("Denied"); } }));
});

test("native cancellation is quiet; unsupported and denied sharing use fallbacks", async () => {
  const data = { title, url };
  assert.equal(await nativeProductShare(data, {}), "fallback");
  assert.equal(await nativeProductShare(data, {
    canShare: () => false, share: async () => { assert.fail("Must not share unsupported data"); },
  }), "fallback");
  assert.equal(await nativeProductShare(data, { share: async () => { throw new DOMException("Cancelled", "AbortError"); } }), "cancelled");
  assert.equal(await nativeProductShare(data, { share: async () => { throw new Error("Denied"); } }), "fallback");
});
