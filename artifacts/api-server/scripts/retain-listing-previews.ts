import { ObjectStorageService } from "../src/lib/objectStorage";
import { retainListingPreviews } from "../src/lib/listingPreviewRetention";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmation = "--confirm=delete-expired-listing-previews-only";
if (args.some(arg => !["--dry-run", "--apply", confirmation].includes(arg)) ||
  (apply && (!args.includes(confirmation) || args.includes("--dry-run"))) ||
  (!apply && args.includes(confirmation))) {
  process.stderr.write("Usage: pnpm previews:retain [--dry-run | --apply --confirm=delete-expired-listing-previews-only]\n");
  process.exitCode = 1;
} else {
  try {
    const buckets = new ObjectStorageService().getListingPreviewBuckets();
    const report = await retainListingPreviews(buckets, {
      apply,
      onEntry: entry => process.stdout.write(`${JSON.stringify({ type: "object", ...entry })}\n`),
    });
    process.stdout.write(`${JSON.stringify({ type: "summary", ...report })}\n`);
  } catch (error) {
    // Do not serialize credential-bearing SDK errors. A failed run is never success.
    process.stderr.write(`Preview retention failed; check storage configuration/access. Code: ${String((error as { code?: number }).code ?? "unknown")}\n`);
    process.exitCode = 1;
  }
}
