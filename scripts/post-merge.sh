#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
# One-time gallery repairs are operator procedures, not merge prerequisites.
# See docs/product-gallery-recovery.md; never mutate catalog media during setup.
