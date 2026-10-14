import images from 'virtual:storefront-images';

/** Only listing alternates opt into uploaded derivatives. Detail/zoom URLs stay original. */
export function responsiveImage(source: string, sizes = '100vw', listingPreview = false) {
  if (listingPreview && /^\/api\/storage\/objects\/uploads\/[0-9a-f-]{36}$/.test(source)) {
    const preview = (width: number) => `${source}?preview=listing-v1&width=${width}`;
    return {
      src: preview(480),
      srcSet: [320, 480, 640, 960].map(width => `${preview(width)} ${width}w`).join(', '),
      sizes,
    };
  }
  const image = images[source];
  return image
    ? { src: image.src, srcSet: image.srcSet, sizes, width: image.width, height: image.height }
    : { src: source };
}
