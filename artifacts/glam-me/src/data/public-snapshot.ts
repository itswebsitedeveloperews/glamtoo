import type { CatalogCategory, CatalogProduct } from './catalog';
import type { HomePageSettings } from './home-page';
import type { ShippingMethod } from '@workspace/shipping';
import { createContext } from 'react';
import type { ProductReviews, Announcement, HeroSlide } from '@workspace/api-client-react';

/** Only public endpoint data. Never add session, account or browser storage here. */
export type PublicSnapshot = {
  announcements?: Announcement[];
  heroSlides?: HeroSlide[];
  products: CatalogProduct[];
  categories: CatalogCategory[];
  homePage: HomePageSettings | null;
  inventory: Record<string, number>;
  sales: Record<string, number>;
  catalogReady?: boolean;
  shippingMethods?: ShippingMethod[];
  returnInformation?: string;
  productReviews?: { productId: number; data?: ProductReviews; unavailable?: boolean };
};

export const PublicSnapshotContext = createContext<PublicSnapshot | null>(null);

export function readPublicSnapshot(): PublicSnapshot | null {
  if (typeof document === 'undefined') return null;
  const node = document.getElementById('public-storefront-data');
  return node ? JSON.parse(node.textContent || 'null') : null;
}
