import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { getAdminAccess, requireAdmin } from "../adminAuth";
import { getObjectAclPolicy } from "../lib/objectAcl";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.post("/storage/uploads/request-url", requireAdmin, async (request, response) => {
  const { name, size, contentType } = request.body ?? {};
  if (typeof name !== "string" || !name.trim() || !Number.isInteger(size) || size <= 0 || typeof contentType !== "string" || !contentType.startsWith("image/")) {
    response.status(400).json({ error: "A valid image name, size, and content type are required." });
    return;
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    response.json({ uploadURL, objectPath, metadata: { name: name.trim().slice(0, 200), size, contentType } });
  } catch (error) {
    request.log.error({ error }, "Error generating image upload URL");
    response.status(500).json({ error: "Failed to generate image upload URL." });
  }
});

router.get("/storage/public-objects/*filePath", async (request, response) => {
  try {
    const raw = request.params.filePath;
    const file = await objectStorageService.searchPublicObject(Array.isArray(raw) ? raw.join("/") : raw);
    if (!file) {
      response.status(404).json({ error: "File not found" });
      return;
    }
    await pipeStorageResponse(objectStorageService, file, response);
  } catch (error) {
    request.log.error({ error }, "Error serving public object");
    response.status(500).json({ error: "Failed to serve public object" });
  }
});

router.get("/storage/objects/*path", async (request, response) => {
  try {
    const raw = request.params.path;
    const file = await objectStorageService.getObjectEntityFile(`/objects/${Array.isArray(raw) ? raw.join("/") : raw}`);
    const aclPolicy = await getObjectAclPolicy(file);
    if (aclPolicy?.visibility !== "public") {
      const access = await getAdminAccess(request);
      if (!access.authorized) {
        response.status(access.authenticated ? 403 : 401).json({ error: "You are not allowed to access this object." });
        return;
      }
    }
    await pipeStorageResponse(objectStorageService, file, response);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      response.status(404).json({ error: "Object not found" });
      return;
    }
    request.log.error({ error }, "Error serving object");
    response.status(500).json({ error: "Failed to serve object" });
  }
});

async function pipeStorageResponse(service: ObjectStorageService, file: Awaited<ReturnType<ObjectStorageService["getObjectEntityFile"]>>, response: Response) {
  const storedResponse = await service.downloadObject(file);
  response.status(storedResponse.status);
  storedResponse.headers.forEach((value, key) => response.setHeader(key, value));
  if (storedResponse.body) Readable.fromWeb(storedResponse.body as ReadableStream<Uint8Array>).pipe(response);
  else response.end();
}

export default router;