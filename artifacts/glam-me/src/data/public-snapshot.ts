import type { CatalogCategory, CatalogProduct } from './catalog';
import type { HomePageSettings } from './home-page';
import type { ShippingMethod } from '@workspace/shipping';
import { createContext } from 'react';

/** Only public endpoint data. Never add session, account or browser storage here. */
export type PublicSnapshot = {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  homePage: HomePageSettings | null;
  inventory: Record<string, number>;
  sales: Record<string, number>;
  catalogReady?: boolean;
  shippingMethods?: ShippingMethod[];
  returnInformation?: string;
};

export const PublicSnapshotContext = createContext<PublicSnapshot | null>(null);

export function readPublicSnapshot(): PublicSnapshot | null {
  if (typeof document === 'undefined') return null;
  const node = document.getElementById('public-storefront-data');
  return node ? JSON.parse(node.textContent || 'null') : null;
}
