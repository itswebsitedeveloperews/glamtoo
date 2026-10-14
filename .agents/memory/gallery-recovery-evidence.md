---
name: Gallery recovery evidence
description: Distinguishing verified lost galleries from intentionally removed or unused media.
---

Restore a missing gallery only when evidence establishes both the intended photo
set and its order. Unreferenced App Storage images, upload timestamps, and a
matching garment are not enough to classify an empty gallery as an accidental
loss. Do not repopulate it from seed defaults.

**Why:** Unused images can reflect deliberate removals. Guessing which photos
belong in a gallery can undo merchant edits even when the originals still exist.

**How to apply:** Audit saved references separately from public readability and
rendering. Back up the catalog, reject intervening edits, and keep a durable
one-time repair receipt so an admin can later clear the gallery without a rerun
bringing it back. For uncertain products, obtain a previous export, screenshot,
or merchant-approved ordering instead of inferring intent from storage contents.

Run one-time media repairs only as explicitly authorized, environment-scoped
operator procedures after initialization and an audit; never make them automatic
merge prerequisites.

**Why:** Repair fingerprints deliberately reject intervening merchant changes,
and new databases do not yet have an initialized catalog. Either situation must
not prevent normal setup or future merges.

**How to apply:** Preserve repair guards and receipts; consult the recovery
documentation for approved evidence and procedures rather than replaying repairs
on every merge.

Allow enough time for remote file readability and hash verification during an
explicitly approved repair; do not remove safety checks to meet a short timeout.

**Why:** Network validation can exceed ordinary setup time even for valid photos.

**How to apply:** Give the operator-run repair sufficient time while retaining
fingerprint checks, original-byte validation and one-time receipts. This does not
make the repair part of automatic post-merge setup.
