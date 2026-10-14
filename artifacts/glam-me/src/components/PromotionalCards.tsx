import type { ReactNode } from "react";
import type { CatalogCategory, CatalogProduct } from "@/data/catalog";
import { getCategorySlug } from "@/data/catalog";
import { responsiveImage } from "@/utils/responsive-images";

export type PromotionalCategory = Pick<CatalogCategory, "id" | "name" | "slug" | "image" | "description">;
export type PromotionalProduct = Pick<CatalogProduct, "id" | "name" | "slug" | "image" | "description" | "position">;

// Shared by the storefront and the read-only admin preview: do not duplicate
// overlays, backplates, crop positions, or promotional copy in the editor.
export function CollectionTile({ category, readOnly = false }: { category: PromotionalCategory; readOnly?: boolean }) {
  return (
    <a className="collection-tile" href={readOnly ? undefined : `/category/${getCategorySlug(category)}`}>
      {category.image && <img {...responsiveImage(category.image, '(max-width: 640px) 100vw, 50vw')} alt={`${category.name} collection`} loading="lazy" decoding="async" />}
      <div>
        <h3>{category.name}</h3>
        {category.description && <p>{category.description}</p>}
        <span className="collection-tile-cta">Shop {category.name} <span aria-hidden="true">→</span></span>
      </div>
    </a>
  );
}

export function MomentCard({ product, index, readOnly = false, children }: {
  product: PromotionalProduct; index: number; readOnly?: boolean; children?: ReactNode;
}) {
  return (
    <article className="moment-card" data-testid={`card-moment-${index}`}>
      <a className="moment-card-link" href={readOnly ? undefined : `/product/${product.slug}`} data-testid={`link-moment-${index}`}>
        {product.image && <img {...responsiveImage(product.image, '(max-width: 640px) 100vw, 33vw')} alt={product.name} loading="lazy" decoding="async" style={{ objectPosition: product.position }} />}
        <div className="moment-copy"><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<span className="moment-shop-link">Shop now <span aria-hidden="true">→</span></span></div>
      </a>
      {children}
    </article>
  );
}
