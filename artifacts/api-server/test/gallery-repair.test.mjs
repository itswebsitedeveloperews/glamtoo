import assert from "node:assert/strict";
import { test } from "node:test";
import { applyGalleryRepair, productFingerprint, repairedProducts, recovery } from "../scripts/gallery-repair.mjs";
import { referenceRecovery } from "../scripts/reference-gallery-recovery.mjs";

const original = { id: 109, slug: "mesh-floral-sleeve-tracksuit", name: "Mesh Floral Sleeve Tracksuit", image: "/assets/original.jpg", price: "£39.99", stock: 3, galleryImages: [] };
const single = { id: 999, image: "/assets/single.jpg", galleryImages: [] };
const existing = { id: 111, image: "/assets/cardigan.jpg", galleryImages: ["/objects/uploads/existing"] };
const repair = { ...recovery, expectedFingerprint: productFingerprint(original) };

test("targeted recovery preserves all merchant fields and other products", () => {
  const products = [original, single, existing];
  const next = repairedProducts(products, repair);
  assert.deepEqual(next[0], { ...original, galleryImages: recovery.galleryImages });
  assert.equal(next[1], single);
  assert.equal(next[2], existing);
  assert.deepEqual(original.galleryImages, [], "input snapshot is never mutated");
  assert.equal(new Set(next[0].galleryImages).size, 3);
  assert.equal(productFingerprint({ b: 2, a: 1 }), productFingerprint({ a: 1, b: 2 }));
});

test("a changed product, populated gallery, or deleted product fails closed", () => {
  for (const products of [
    [{ ...original, price: "£44.99" }],
    [{ ...original, galleryImages: ["/objects/uploads/merchant-photo"] }],
    [single],
  ]) assert.throws(() => repairedProducts(products, repair), /audited product changed/);
});

test("receipt prevents an intentionally cleared gallery from ever being restored again", async () => {
  const queries = [];
  const client = { async query(sql) {
    queries.push(sql);
    return { rows: sql.startsWith("SELECT id FROM") ? [{ id: recovery.key }] : [] };
  } };
  const result = await applyGalleryRepair(client, () => { throw Error("must not recheck or republish media"); }, repair);
  assert.equal(result.status, "already-applied");
  assert.equal(queries.some((sql) => /UPDATE|INSERT/.test(sql)), false);
});

test("backup and gallery change commit together, only after media validation", async () => {
  const before = { id: 1, products: [original, single, existing], categories: [{ id: 1 }], home_page: { categoryIds: [] } };
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    return { rows: sql.startsWith("SELECT * FROM") ? [before] : [] };
  } };
  await applyGalleryRepair(client, async (paths) => {
    assert.deepEqual(paths, repair.galleryImages);
    assert.equal(calls.some(({ sql }) => /^(INSERT|UPDATE)/.test(sql)), false);
  }, repair);
  const backup = calls.find(({ sql }) => sql.startsWith("INSERT"));
  assert.deepEqual(JSON.parse(backup.params[1]), before);
  const update = calls.find(({ sql }) => sql.startsWith("UPDATE"));
  assert.deepEqual(JSON.parse(update.params[0]), repairedProducts(before.products, repair));
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("inaccessible originals abort recovery without a durable data change", async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    return { rows: sql.startsWith("SELECT * FROM") ? [{ products: [original] }] : [] };
  } };
  await assert.rejects(applyGalleryRepair(client, async () => { throw Error("missing original"); }, repair), /missing original/);
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.equal(calls.some((sql) => /^(INSERT|UPDATE)/.test(sql)), false);
});

test("reference-shop batch restores every selected gallery in one backed-up transaction", async () => {
  const second = { ...single, name: "A different product" };
  const batch = {
    key: "batch-fixture",
    products: [repair, { productId: second.id, expectedFingerprint: productFingerprint(second), galleryImages: ["/objects/uploads/other-view"] }],
  };
  const before = { id: 1, products: [original, second, existing], categories: [], home_page: { categoryIds: [] } };
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    return { rows: sql.startsWith("SELECT * FROM") ? [before] : [] };
  } };
  const result = await applyGalleryRepair(client, async (paths) => {
    assert.deepEqual(paths, [...repair.galleryImages, "/objects/uploads/other-view"]);
  }, batch);
  assert.deepEqual(result.productIds, [109, 999]);
  assert.equal(result.supportingPhotos, 4);
  assert.equal(calls.filter(({ sql }) => sql.startsWith("UPDATE")).length, 1);
  assert.equal(calls.filter(({ sql }) => sql.startsWith("INSERT")).length, 1);
  const after = JSON.parse(calls.find(({ sql }) => sql.startsWith("UPDATE")).params[0]);
  assert.deepEqual(after[0].galleryImages, repair.galleryImages);
  assert.deepEqual(after[1].galleryImages, ["/objects/uploads/other-view"]);
  assert.deepEqual(after[2], existing);
  assert.deepEqual(JSON.parse(calls.find(({ sql }) => sql.startsWith("INSERT")).params[1]), before);
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("one changed product rejects the whole reference batch before any catalog write", async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    return { rows: sql.startsWith("SELECT * FROM") ? [{ products: [original, single] }] : [] };
  } };
  const batch = { key: "changed-batch", products: [repair, { productId: single.id, expectedFingerprint: "not-the-audited-snapshot", galleryImages: ["/objects/uploads/other-view"] }] };
  await assert.rejects(applyGalleryRepair(client, async () => { throw Error("Must not read media before checking every product"); }, batch), /audited product changed/);
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.equal(calls.some((sql) => /^(INSERT|UPDATE)/.test(sql)), false);
});

test("pinned reference covers all twelve previously empty galleries without touching complete ones", () => {
  assert.equal(referenceRecovery.sourceUrl, "https://glamtoo.webdesignessex.io/shop");
  assert.deepEqual(referenceRecovery.products.map((product) => product.productId), [110, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122]);
  for (const product of referenceRecovery.products) {
    assert.match(product.expectedFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(product.galleryImages.length, 3);
    assert.equal(new Set(product.galleryImages).size, 3);
    assert.equal(product.gallerySha256.length, product.galleryImages.length);
    for (const hash of product.gallerySha256) assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(new Set(product.gallerySha256).size, 3, "no duplicate photo bytes within one product");
  }
});
