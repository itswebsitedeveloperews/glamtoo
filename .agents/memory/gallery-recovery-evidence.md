---
name: Gallery recovery evidence
description: Distinguishing verified lost galleries from intentionally removed or unused media.
---

Restore a missing gallery only when evidence establishes both the intended photo
set and its order. Unreferenced App Storage images, upload timestamps, and a
matching garment are not enough to classify an empty gallery as an accidental
loss. Do not repopulate it from seed defaults.

**Why:** Investigation found intact original uploads but no historical catalog
revisions. A merchant screenshot established one exact four-view gallery; other
unused product views could also represent deliberate removals.

**How to apply:** Audit saved references separately from public readability and
rendering. Back up the catalog, reject intervening edits, and keep a durable
one-time repair receipt so an admin can later clear the gallery without a rerun
bringing it back. For uncertain products, obtain a previous export, screenshot,
or merchant-approved ordering instead of inferring intent from storage contents.

The merchant explicitly approved using `https://glamtoo.webdesignessex.io/shop`
as the reference for comparing all products and adding their gallery images.

**Why:** The user supplied that shop after the screenshot-only recovery and asked
to compare every product and add its gallery photos.

**How to apply:** Use its explicitly matched product galleries as recovery
evidence, preserving current non-media merchant fields. This approval does not
authorize a permanent sync, unrelated catalog replacement, or production writes.

Allow enough post-merge setup time for remote gallery-file and hash validation;
do not remove the safety checks merely to meet a short setup timeout.

**Why:** A recovery setup exceeded the original time limit while verifying
remote photos, then completed successfully with more time.

**How to apply:** Keep the one-time repair receipts and validation intact, and
size the setup timeout for the work it actually performs.
