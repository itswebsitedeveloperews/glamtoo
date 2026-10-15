import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "@workspace/db";
import { heroSlideInput, validHeroCTA, listHeroSlides, publishImages } from "../src/heroSlides";
import { createHeroSlidesRouter } from "../src/routes/heroSlides";

const input = { desktopImage: "/images/desktop.webp", mobileImage: "/images/mobile.webp",
  heading: "The edit", text: "Your next look", ctaText: "Explore", ctaLink: "/shop",
  altText: "Model wearing a boutique outfit", textPosition: "left" as const, displayOrder: 0, enabled: true };
test("enabling stored hero images publishes their ACL; disabled and already-public images are untouched", async () => {
  let policy: { owner: string; visibility: string } | null = null;
  let writes = 0, reads = 0;
  const file = {
    exists: async () => [true],
    getMetadata: async () => [{ metadata: policy ? { "custom:aclPolicy": JSON.stringify(policy) } : {} }],
    setMetadata: async (value: {metadata: Record<string, string>}) => { writes++; policy = JSON.parse(value.metadata["custom:aclPolicy"]); },
  } as unknown as import("@google-cloud/storage").File;
  const storage = { getObjectEntityFile: async () => { reads++; return file; } };
  const stored = { ...input, desktopImage: "/objects/uploads/example", mobileImage: "/api/storage/objects/uploads/example" };
  await publishImages({ ...stored, enabled: false }, storage);
  assert.equal(reads, 0);
  await publishImages(stored, storage);
  assert.equal(writes, 1);
  assert.equal((policy as { visibility: string } | null)?.visibility, "public");
  await publishImages(stored, storage);
  assert.equal(writes, 1);
});
test("hero validates images, alt, positions, CTA pairs, limits and unsafe links", () => {
  assert.equal(heroSlideInput.safeParse(input).success, true);
  for (const invalid of [{ desktopImage: "" }, { mobileImage: "javascript:alert(1)" }, { altText: " " },
    { textPosition: "invalid" }, { displayOrder: -1 }, { heading: "x".repeat(121) }, { ctaLink: "//evil.example" },
    { heading: "a\u0000b" }, { enabled: "true" }]) {
    assert.equal(heroSlideInput.safeParse({ ...input, ...invalid }).success, false);
  }
  assert.equal(validHeroCTA({ ...input, ctaLink: null }), false);
  assert.equal(validHeroCTA({ ...input, ctaText: "", ctaLink: null }), true);
});
test("isolated hero database/API: migration, authorization, CRUD, ordering, persistence, conflicts and empty state", {
  skip: process.env.HERO_DB_TESTS !== "1",
}, async () => {
  assert.equal(process.env.NODE_ENV, "test");
  const schema = `hero_test_${randomUUID().replaceAll("-", "")}`;
  // All data lives in a disposable schema, never the merchant's hero tables.
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await pool.query(`SET search_path TO "${schema}"`);
  pool.on("connect", client => { void client.query(`SET search_path TO "${schema}"`); });
  const app = express(); app.use(express.json());
  app.use("/api", createHeroSlidesRouter((req, res, next) => {
    const role = req.get("x-test-role");
    if (!role) { res.sendStatus(401); return; }
    if (role !== "admin") { res.sendStatus(403); return; }
    next();
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No listener");
  const request = (path: string, method = "GET", body?: unknown, role: string | null = "admin") => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method, headers: { "Content-Type": "application/json", ...(role ? { "x-test-role": role } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    const migrated = await listHeroSlides();
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0].heading, "It's your moment");
    assert.equal((await request("/admin/hero-slides", "GET", undefined, null)).status, 401);
    assert.equal((await request("/admin/hero-slides", "POST", input, "customer")).status, 403);
    assert.equal((await request("/admin/hero-slides", "POST", { ...input, altText: "" })).status, 400);
    const response = await request("/admin/hero-slides", "POST", input);
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal((await pool.query("SELECT data FROM store_hero_slides WHERE id=$1", [created.id])).rows[0].data.mobileImage, input.mobileImage);
    const edit = await request(`/admin/hero-slides/${created.id}`, "PATCH", { ...input, heading: "Updated", expectedRevision: created.revision });
    const saved = await edit.json(); assert.equal(edit.status, 200);
    assert.equal(saved.revision, 2);
    assert.ok((await (await request("/hero-slides", "GET", undefined, null)).json()).slides.some((s: {heading:string}) => s.heading === "Updated"));
    assert.equal((await request(`/admin/hero-slides/${created.id}`, "PATCH", { ...input, expectedRevision: 1 })).status, 409);
    assert.equal((await request(`/admin/hero-slides/${created.id}`, "DELETE", { expectedRevision: 1 })).status, 409);
    const disable = await request(`/admin/hero-slides/${created.id}`, "PATCH", { ...input, enabled: false, expectedRevision: 2 });
    assert.equal(disable.status, 200);
    const publicResponse = await request("/hero-slides");
    assert.equal(publicResponse.headers.get("cache-control"), "no-store");
    assert.equal((await publicResponse.json()).slides.length, 1);
    // Explicitly emptying the isolated configuration stays empty on subsequent reads.
    for (const slide of await listHeroSlides()) assert.equal((await request(`/admin/hero-slides/${slide.id}`, "DELETE", { expectedRevision: slide.revision })).status, 204);
    assert.deepEqual(await listHeroSlides(), []);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM store_hero_initialization")).rows[0].count, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
