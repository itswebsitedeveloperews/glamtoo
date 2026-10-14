---
name: Preview retention safety
description: Why listing-preview cleanup uses age rather than catalog ownership or last-access tracking.
---

Use conservative age-based retention for generated listing previews, including
current-encoder entries, rather than trying to infer catalog ownership from
opaque historical hashes. Keep cleanup dry-run-first and explicitly opt into
deletion; do not turn it into destructive startup maintenance.

**Why:** Historical derivative names do not reveal their sources or usage.
Catalog history may still reference originals, and reads do not record last
access. Evicting only regenerable copies bounds orphan accumulation without
risking full-resolution media or changing catalog history.

**How to apply:** Follow the documented operator retention procedure. Preserve
the reserved derivative namespace boundary, conservative grace periods,
generation/metageneration deletion preconditions and on-demand regeneration.
Never treat source upload deletion or catalog rewriting as a cleanup shortcut.
