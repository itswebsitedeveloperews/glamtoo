import { pool } from "@workspace/db";
import { CreateHeroSlideBody, CreateHeroSlideResponse } from "@workspace/api-zod";
import { z } from "zod";
import { isAnnouncementLink, AnnouncementConflict, AnnouncementNotFound } from "./announcements";
import { ObjectStorageService } from "./lib/objectStorage";
import { getObjectAclPolicy, setObjectAclPolicy } from "./lib/objectAcl";

const clean = (max: number) => z.string().trim().max(max).refine(value => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value), "Use plain text.");
const image = clean(2048).refine(value => isAnnouncementLink(value), "Choose a stored image or a public HTTPS image.");
export const heroSlideInput = CreateHeroSlideBody.extend({
  desktopImage: image,
  mobileImage: image,
  heading: clean(120),
  text: clean(320),
  ctaText: clean(60),
  ctaLink: z.string().trim().max(2048).nullable().refine(value => value === null || isAnnouncementLink(value), "Choose a safe link."),
  altText: clean(240).refine(value => value.length > 0, "Describe the slide image."),
}).strict();
export const validHeroCTA = (input: z.infer<typeof heroSlideInput>) => Boolean(input.ctaText) === Boolean(input.ctaLink);
export const heroSlideUpdate = heroSlideInput.extend({ expectedRevision: z.number().int().positive() });
export type HeroSlide = z.infer<typeof CreateHeroSlideResponse>;
type Input = z.infer<typeof heroSlideInput>;

// One-time migration of the existing approved homepage; not a runtime fallback.
// A separate marker prevents deleted/disabled slides from being restored.
const existingHero: Input = {
  desktopImage: "/images/home-hero-original.webp", mobileImage: "/images/home-hero-original.webp",
  heading: "It's your moment", text: "Standout outfits for every plan on your calendar.",
  ctaText: "Shop the collection", ctaLink: "/shop",
  altText: "Woman in a pink dress beside a vintage pink car on a sunny street",
  textPosition: "left", displayOrder: 0, enabled: true,
};
let ready: Promise<void> | undefined;
export function ensureHeroSlides(): Promise<void> {
  ready ??= (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('store-hero-slides-initialization'))");
      await client.query(`CREATE TABLE IF NOT EXISTS store_hero_slides (
        id serial PRIMARY KEY, data jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE IF NOT EXISTS store_hero_initialization (id integer PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());`);
      const marker = await client.query("INSERT INTO store_hero_initialization(id) VALUES(1) ON CONFLICT DO NOTHING RETURNING id");
      if (marker.rowCount) await client.query("INSERT INTO store_hero_slides(data) VALUES($1::jsonb)", [JSON.stringify(existingHero)]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
const columns = `data || jsonb_build_object('id',id,'revision',revision) AS slide`;
export async function publishImages(input: Input, storage: Pick<ObjectStorageService, "getObjectEntityFile"> = new ObjectStorageService()) {
  if (!input.enabled) return;
  for (const reference of new Set([input.desktopImage, input.mobileImage])) {
    const path = reference.startsWith("/api/storage/objects/") ? reference.slice("/api/storage".length) : reference;
    if (!path.startsWith("/objects/")) continue;
    const file = await storage.getObjectEntityFile(path);
    const policy = await getObjectAclPolicy(file);
    if (policy?.visibility !== "public") {
      await setObjectAclPolicy(file, { owner: policy?.owner ?? "glam-too-store", visibility: "public" });
    }
  }
}
export async function listHeroSlides(enabledOnly = false): Promise<HeroSlide[]> {
  await ensureHeroSlides();
  const result = await pool.query<{ slide: HeroSlide }>(`SELECT ${columns} FROM store_hero_slides
    ${enabledOnly ? "WHERE data->>'enabled'='true'" : ""} ORDER BY (data->>'displayOrder')::int,id`);
  return result.rows.map(row => row.slide);
}
export async function createHeroSlide(input: Input): Promise<HeroSlide> {
  await ensureHeroSlides();
  await publishImages(input);
  return (await pool.query<{ slide: HeroSlide }>(`INSERT INTO store_hero_slides(data) VALUES($1::jsonb) RETURNING ${columns}`, [JSON.stringify(input)])).rows[0].slide;
}
async function missing(id: number): Promise<never> {
  if (!(await pool.query("SELECT id FROM store_hero_slides WHERE id=$1", [id])).rowCount) throw new AnnouncementNotFound("This slide no longer exists.");
  throw new AnnouncementConflict("This slide changed in another session. Reload the latest version before saving.");
}
export async function updateHeroSlide(id: number, input: Input, revision: number): Promise<HeroSlide> {
  await ensureHeroSlides();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT revision FROM store_hero_slides WHERE id=$1 FOR UPDATE", [id]);
    if (!current.rowCount) throw new AnnouncementNotFound("This slide no longer exists.");
    if (current.rows[0].revision !== revision) throw new AnnouncementConflict("This slide changed in another session. Reload before saving.");
    await publishImages(input);
    const result = await client.query<{ slide: HeroSlide }>(`UPDATE store_hero_slides SET data=$2::jsonb,
      revision=revision+1,updated_at=now() WHERE id=$1 RETURNING ${columns}`, [id, JSON.stringify(input)]);
    await client.query("COMMIT");
    return result.rows[0].slide;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function deleteHeroSlide(id: number, revision: number) {
  await ensureHeroSlides();
  if (!(await pool.query("DELETE FROM store_hero_slides WHERE id=$1 AND revision=$2 RETURNING id", [id, revision])).rowCount) await missing(id);
}
