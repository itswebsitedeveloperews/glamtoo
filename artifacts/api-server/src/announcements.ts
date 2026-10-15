import { pool } from "@workspace/db";
import { CreateAnnouncementBody, CreateAnnouncementResponse } from "@workspace/api-zod";
import { z } from "zod";

export function isAnnouncementLink(value: string) {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value) || value.startsWith("//")) return false;
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && !/(?:^|\.)(?:replit\.dev|localhost|local|internal)$/.test(url.hostname);
  } catch { return false; }
}
export const announcementInput = CreateAnnouncementBody.extend({
  text: z.string().trim().min(1).max(160).refine(value => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value), "Use plain announcement text."),
  link: z.string().trim().max(2048).nullable().refine(value => value === null || isAnnouncementLink(value), "Use a /relative path or public HTTPS link."),
}).strict();
export const announcementUpdate = announcementInput.extend({ expectedRevision: z.number().int().positive() });
export type Announcement = z.infer<typeof CreateAnnouncementResponse>;
type Input = z.infer<typeof announcementInput>;
let ready: Promise<void> | undefined;

export function ensureAnnouncements() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS store_announcements (
      id serial PRIMARY KEY, text varchar(160) NOT NULL, link text,
      display_order integer NOT NULL DEFAULT 0, enabled boolean NOT NULL DEFAULT false,
      revision integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT store_announcements_text_check CHECK(length(trim(text)) > 0),
      CONSTRAINT store_announcements_order_check CHECK(display_order BETWEEN 0 AND 10000),
      CONSTRAINT store_announcements_revision_check CHECK(revision > 0)
    );
    CREATE INDEX IF NOT EXISTS store_announcements_display_idx ON store_announcements(enabled,display_order,id);
  `).then(() => undefined).catch(error => { ready = undefined; throw error; });
  return ready;
}
const columns = `id,text,link,display_order AS "displayOrder",enabled,revision`;
export async function listAnnouncements(onlyEnabled = false): Promise<Announcement[]> {
  await ensureAnnouncements();
  return (await pool.query<Announcement>(`SELECT ${columns} FROM store_announcements ${onlyEnabled ? "WHERE enabled=true" : ""} ORDER BY display_order,id`)).rows;
}
export async function createAnnouncement(input: Input): Promise<Announcement> {
  await ensureAnnouncements();
  return (await pool.query<Announcement>(`INSERT INTO store_announcements(text,link,display_order,enabled)
    VALUES($1,$2,$3,$4) RETURNING ${columns}`, [input.text, input.link, input.displayOrder, input.enabled])).rows[0];
}
export class AnnouncementConflict extends Error {}
export class AnnouncementNotFound extends Error {}
async function missingOrConflict(id: number): Promise<never> {
  const exists = await pool.query("SELECT id FROM store_announcements WHERE id=$1", [id]);
  if (!exists.rowCount) throw new AnnouncementNotFound("This announcement no longer exists.");
  throw new AnnouncementConflict("This announcement was changed in another session. Refresh before editing or deleting it.");
}
export async function updateAnnouncement(id: number, input: Input, expectedRevision: number): Promise<Announcement> {
  await ensureAnnouncements();
  const result = await pool.query<Announcement>(`UPDATE store_announcements SET text=$2,link=$3,display_order=$4,
    enabled=$5,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$6 RETURNING ${columns}`,
  [id, input.text, input.link, input.displayOrder, input.enabled, expectedRevision]);
  return result.rows[0] ?? missingOrConflict(id);
}
export async function deleteAnnouncement(id: number, expectedRevision: number) {
  await ensureAnnouncements();
  const result = await pool.query("DELETE FROM store_announcements WHERE id=$1 AND revision=$2 RETURNING id", [id, expectedRevision]);
  if (!result.rowCount) await missingOrConflict(id);
}
