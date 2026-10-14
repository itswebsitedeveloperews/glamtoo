# Listing preview retention

## Safety boundary

`listing-previews/` is reserved exclusively for regenerable listing WebP copies,
never uploads. Maintenance only lists that prefix in the media buckets already
configured for the API server. It never lists/deletes original upload paths,
changes source metadata, or reads/writes catalog records or history.

Only `listing-previews/listing-v<N>/<64 lowercase hex characters>.webp` objects
with WebP content type and complete age/generation metadata are eligible.
Unrecognized files, future encoder versions, missing metadata and future dates
are retained. Storage/auth failures stop the run with a nonzero exit code.

## Retention and grace policy

- **Current encoder: 90 days** after the later of creation or last modification.
- **Retired encoders: 30 days** after the later of creation or last modification.
- Grace periods are fixed minimums, not operator-adjustable flags.
- Reads do not refresh age. Current copies eventually expire even if still in
  use. This intentionally covers orphaned copies from the original opaque hash
  format without guessing source ownership or modifying catalog history.
- An expired, still-needed copy is recreated on the next authorized preview
  request, using the intact original and the usual source-generation/width/
  encoder cache key. A cold request may take longer to encode.
- A run uses one fixed start time; new/regenerated copies cannot age into that
  run. Every candidate gets fresh metadata; deletion requires matching object
  generation AND metageneration. Concurrent changes (412) and disappearance (404)
  are reported and skipped.
- At most **100 deletion attempts per invocation across all configured buckets**.
  Scanning is paginated (200 objects/page); reports stream one JSON line per
  object plus a summary with candidate/deleted bytes, skipped races and limits.
  Storage versions, soft-delete retention and billing remain bucket policy;
  this process deletes live derivative objects only.

## Operator procedure: report first

Run from the workspace root in the intended environment:

```sh
pnpm --filter @workspace/api-server previews:retain --dry-run
```

No argument also means dry-run. Save output to a local ignored location if needed:

```sh
mkdir -p generated-artifacts
pnpm --filter @workspace/api-server previews:retain --dry-run > generated-artifacts/preview-retention-report.jsonl
```

The command wrapper may print package/build headers before the JSON lines.
Inspect the `object` decisions and `summary`. Ensure every candidate is a
derivative and the retention counts are plausible. Report files contain internal
bucket/object identifiers: do not publish them.

Only after inspecting the report, deliberately enable deletion:

```sh
pnpm --filter @workspace/api-server previews:retain --apply --confirm=delete-expired-listing-previews-only
```

Apply rescans and revalidates; it does not trust an old report. Repeat dry-run/
apply cycles if the deletion limit is reached. No destructive scheduler or
server-startup cleanup is enabled. Run this procedure monthly to keep retired
and orphaned copies from building up. Schedule it only after an operator has
approved the report and chosen the intended storage environment.

## Verification

```sh
pnpm --filter @workspace/api-server test:listing-preview
pnpm --filter @workspace/api-server test:preview-retention
```

The retention suite uses in-memory storage, including dry-run immutability,
strict namespace exclusions, policy boundaries, pagination, deletion limits,
concurrent replacement, storage errors and active-preview regeneration after
eviction. No test deletes an actual shop object.
