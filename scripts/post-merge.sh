#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server exec node scripts/restore-product-gallery.mjs
pnpm --filter @workspace/api-server exec node scripts/restore-product-gallery.mjs --reference-shop
