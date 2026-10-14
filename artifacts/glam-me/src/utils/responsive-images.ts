import images from 'virtual:storefront-images';

/** Uploaded/external media stay untouched; original full-resolution URLs remain available for zoom. */
export function responsiveImage(source: string, sizes = '100vw') {
  const image = images[source];
  return image
    ? { src: image.src, srcSet: image.srcSet, sizes, width: image.width, height: image.height }
    : { src: source };
}
