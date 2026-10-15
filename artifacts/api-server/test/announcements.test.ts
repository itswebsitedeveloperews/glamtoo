import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "@workspace/db";
import { announcementInput, announcementUpdate, isAnnouncementLink, ensureAnnouncements } from "../src/announcements";
import { createAnnouncementsRouter } from "../src/routes/announcements";

test("announcement validation trims text, rejects empty/unsafe values and bounds order", () => {
  const valid = { text: "  Browse our newest pieces  ", link: "/shop", displayOrder: 0, enabled: false };
  assert.equal(announcementInput.parse(valid).text, "Browse our newest pieces");
  for (const link of ["javascript:alert(1)", "//evil.example", "/\\evil", "http://example.com", "https://name:password@example.com", "https://localhost", "https://project.replit.dev", " /shop"]) {
    assert.equal(isAnnouncementLink(link), false, link);
  }
  for (const change of [{ text: "   " }, { text: "a".repeat(161) }, { text: "a\u0000b" }, { displayOrder: -1 }, { displayOrder: 1.5 }, { displayOrder: 10001 }, { enabled: "true" }, { link: "javascript:alert(1)" }, { id: 9 }]) {
    assert.equal(announcementInput.safeParse({ ...valid, ...change }).success, false);
  }
  assert.equal(announcementInput.safeParse({ ...valid, link: null }).success, true);
  assert.equal(announcementInput.safeParse({ ...valid, link: "https://example.com/new?offer=1#details" }).success, true);
  assert.equal(announcementUpdate.safeParse({ ...valid, expectedRevision: 0 }).success, false);
});

test("announcement API persists CRUD, filters public rows, orders deterministically and rejects stale writes", {
  skip: process.env.ANNOUNCEMENT_DB_TESTS !== "1",
}, async () => {
  assert.equal(process.env.NODE_ENV, "test", "Run isolated database tests with NODE_ENV=test");
  await ensureAnnouncements();
  const owned: number[] = [];
  const marker = `Announcement test ${randomUUID()}`;
  const app = express();
  app.use(express.json());
  // Only this isolated test server uses a fixture authorizer. Production always
  // mounts the default router with the existing Clerk/admin middleware.
  app.use("/api", createAnnouncementsRouter((req, res, next) => {
    const role = req.get("x-test-role");
    if (!role) { res.status(401).json({ error: "Sign in required" }); return; }
    if (role !== "admin") { res.status(403).json({ error: "Administrator required" }); return; }
    next();
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test listener");
  const base = `http://127.0.0.1:${address.port}/api`;
  const request = (path: string, method = "GET", body?: unknown, role: string | null = "admin") => fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(role ? { "x-test-role": role } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const input = { text: marker, link: "/shop", displayOrder: 2, enabled: true };
  try {
    assert.equal((await request("/admin/announcements", "GET", undefined, null)).status, 401);
    assert.equal((await request("/admin/announcements", "POST", input, "customer")).status, 403);
    assert.equal((await request("/admin/announcements", "POST", { ...input, text: " " })).status, 400);
    const a = await request("/admin/announcements", "POST", input);
    assert.equal(a.status, 201);
    const first = await a.json(); owned.push(first.id);
    const b = await request("/admin/announcements", "POST", { ...input, text: `${marker} second`, displayOrder: 1 });
    const second = await b.json(); owned.push(second.id);
    const c = await request("/admin/announcements", "POST", { ...input, text: `${marker} hidden`, enabled: false });
    const hidden = await c.json(); owned.push(hidden.id);
    const publicResponse = await request("/announcements?includeDisabled=true", "GET", undefined, null);
    assert.equal(publicResponse.headers.get("cache-control"), "no-store");
    const publicData = await publicResponse.json();
    assert.deepEqual(publicData.announcements.filter((row: { id: number }) => owned.includes(row.id)).map((row: { id: number }) => row.id), [second.id, first.id]);
    assert.equal((await pool.query("SELECT text FROM store_announcements WHERE id=$1", [first.id])).rows[0].text, marker);
    const edited = await request(`/admin/announcements/${first.id}`, "PATCH", {
      ...input, text: `${marker} edited`, link: null, displayOrder: 0, expectedRevision: first.revision,
    });
    assert.equal(edited.status, 200);
    const saved = await edited.json();
    assert.equal(saved.revision, first.revision + 1);
    const refresh = await (await request("/admin/announcements")).json();
    assert.equal(refresh.announcements.find((row: { id: number }) => row.id === first.id).text, `${marker} edited`);
    assert.equal((await request(`/admin/announcements/${first.id}`, "PATCH", { ...input, expectedRevision: first.revision })).status, 409);
    assert.equal((await request(`/admin/announcements/${first.id}`, "DELETE", { expectedRevision: first.revision })).status, 409);
    const ordered = await (await request("/announcements")).json();
    assert.deepEqual(ordered.announcements.filter((row: { id: number }) => owned.includes(row.id)).map((row: { id: number }) => row.id), [first.id, second.id]);
    const disabled = await request(`/admin/announcements/${first.id}`, "PATCH", { ...input, enabled: false, expectedRevision: saved.revision });
    const disabledRow = await disabled.json();
    assert.equal(disabled.status, 200);
    assert.ok(!(await (await request("/announcements")).json()).announcements.some((row: { id: number }) => row.id === first.id));
    assert.equal((await request(`/admin/announcements/${first.id}`, "DELETE", { expectedRevision: disabledRow.revision })).status, 204);
    assert.equal((await request(`/admin/announcements/${first.id}`, "DELETE", { expectedRevision: disabledRow.revision })).status, 404);
  } finally {
    if (owned.length) await pool.query("DELETE FROM store_announcements WHERE id=ANY($1::int[])", [owned]);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
