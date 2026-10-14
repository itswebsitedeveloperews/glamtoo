import { useState, useSyncExternalStore } from "react";
import { getCatalogProductImages } from "@/data/catalog";
import { responsiveImage } from "@/utils/responsive-images";

const hoverQuery = "(hover: hover) and (pointer: fine)";
const canHover = () => window.matchMedia(hoverQuery).matches;
const serverCanHover = () => false;
function subscribeToHover(callback: () => void) {
  const query = window.matchMedia(hoverQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** Use the same ordered gallery as the detail slider; never hide the main image
 * until its alternate has loaded, or download alternates on touch-only devices. */
export function ProductListingImage({ image, galleryImages, alt, sizes = "100vw", position }: {
  image: string;
  galleryImages?: string[];
  alt: string;
  sizes?: string;
  position?: string;
}) {
  const hoverEnabled = useSyncExternalStore(subscribeToHover, canHover, serverCanHover);
  const secondImage = getCatalogProductImages({ image, galleryImages })[1];
  const [loadedSource, setLoadedSource] = useState("");
  const [failedSource, setFailedSource] = useState("");
  const showAlternate = hoverEnabled && secondImage && failedSource !== secondImage;
  const ready = showAlternate && loadedSource === secondImage;

  return (
    <span className={`listing-product-images${ready ? " is-ready" : ""}`}>
      <img {...responsiveImage(image, sizes)} alt={alt} loading="lazy" decoding="async" style={{ objectPosition: position }} />
      {showAlternate && (
        <img
          className="listing-product-image-secondary"
          {...responsiveImage(secondImage, sizes, true)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          style={{ objectPosition: position }}
          onLoad={() => setLoadedSource(secondImage)}
          onError={() => setFailedSource(secondImage)}
        />
      )}
    </span>
  );
}
