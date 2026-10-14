import { createHash } from "node:crypto";
import type { File } from "@google-cloud/storage";
import sharp from "sharp";

export const listingPreviewWidths = [320, 480, 640, 960] as const;
export const listingPreviewVersion = "listing-v1";
const maxSourceBytes = 25 * 1024 * 1024;
const pending = new Map<string, Promise<Buffer>>();
let activeEncodes = 0;
const waiting: (() => void)[] = [];

async function withEncodeSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeEncodes >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else activeEncodes++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activeEncodes--;
  }
}

export class PreviewBusyError extends Error {}
export class PreviewSourceError extends Error {}

/** No crop/upscale: the gallery original and its aspect ratio remain intact. */
export async function encodeListingPreview(input: Buffer, width: number) {
  if (!listingPreviewWidths.includes(width as typeof listingPreviewWidths[number])) {
    throw new PreviewSourceError("Unsupported preview width.");
  }
  if (input.length > maxSourceBytes) throw new PreviewSourceError("Image is too large for a preview.");
  return sharp(input, { limitInputPixels: 40_000_000, animated: false })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 76, effort: 4 })
    .timeout({ seconds: 10 })
    .toBuffer();
}

/** Persistent, generation-keyed derivatives survive restarts. Never mutate source metadata/bytes.
 * Authorization must be checked against the SOURCE before calling, even on cache hits. */
export async function getListingPreview(source: File, width: number) {
  const [metadata] = await source.getMetadata();
  if (!metadata.contentType?.startsWith("image/") || Number(metadata.size) > maxSourceBytes) {
    throw new PreviewSourceError("Unsupported preview source.");
  }
  const key = createHash("sha256")
    .update(`${listingPreviewVersion}:${source.name}:${metadata.generation}:${width}`)
    .digest("hex");
  const existing = pending.get(key);
  if (existing) return { bytes: await existing, etag: `"${key}"` };
  // Let a normal listing's concurrent requests queue, but bound memory/CPU
  // during a burst. Only two original downloads/decodes are active at a time.
  if (pending.size >= 64) throw new PreviewBusyError("Preview service is busy.");
  const work = (async () => {
    const derivative = source.bucket.file(`listing-previews/${listingPreviewVersion}/${key}.webp`);
    try {
      const [bytes] = await derivative.download();
      return bytes;
    } catch (error) {
      if ((error as { code?: number }).code !== 404) throw error;
    }
    return withEncodeSlot(async () => {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of source.createReadStream()) {
        size += chunk.length;
        if (size > maxSourceBytes) throw new PreviewSourceError("Image is too large for a preview.");
        chunks.push(Buffer.from(chunk));
      }
      const bytes = await encodeListingPreview(Buffer.concat(chunks), width);
      await derivative.save(bytes, {
        resumable: false,
        metadata: { contentType: "image/webp", cacheControl: "private, max-age=31536000, immutable" },
      });
      return bytes;
    });
  })();
  pending.set(key, work);
  try {
    return { bytes: await work, etag: `"${key}"` };
  } finally {
    pending.delete(key);
  }
}
