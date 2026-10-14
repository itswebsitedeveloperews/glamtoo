import { Readable } from "node:stream";
import type { File } from "@google-cloud/storage";

export const images = new Map<string, { bytes: Buffer; public: boolean; downloads: number; fail: boolean; failAtDownload?: number; stored: Map<string, Buffer> }>();
export class ObjectNotFoundError extends Error {}
export class ObjectStorageService {
  async getObjectEntityFile(path: string) {
    const image = images.get(path);
    if (!image) throw new ObjectNotFoundError();
    return {
      name: path,
      getMetadata: async () => [{
        generation: "1", contentType: "image/jpeg", size: image.bytes.length,
        metadata: { "custom:aclPolicy": JSON.stringify({ owner: "admin", visibility: image.public ? "public" : "private" }) },
      }],
      createReadStream() {
        image.downloads++;
        return image.fail || image.downloads === image.failAtDownload ? Readable.from((async function* () { throw new Error("Temporary source failure"); })()) : Readable.from([image.bytes]);
      },
      bucket: { file: (key: string) => ({
        async download() {
          const bytes = image.stored.get(key);
          if (!bytes) throw Object.assign(new Error("Not found"), { code: 404 });
          return [bytes];
        },
        async save(bytes: Buffer) { image.stored.set(key, bytes); },
      }) },
    } as unknown as File;
  }
}
