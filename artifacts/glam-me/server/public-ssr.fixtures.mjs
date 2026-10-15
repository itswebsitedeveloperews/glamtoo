// Shared by production HTTP checks and the isolated SSR browser harness.
export const categories = [{ id: 50, name: 'Dresses', slug: 'stable-dresses', description: 'Current collection', image: '/objects/category.webp' }];
export const simple = {
  id: 9001, name: 'Live cotton dress', slug: 'live-cotton', category: 'Dresses',
  status: 'Published', type: 'Simple', price: '£27.25', stock: 7,
  image: '/objects/cotton.webp', galleryImages: [], position: '50% 50%',
  description: 'Actual public description', sku: 'LIVE', variations: [],
  longDescription: '<p>Detailed cotton <strong>description</strong><img src=x onerror=alert(1)><script>alert(1)</script></p>',
};
export const variable = {
  ...simple, id: 9002, name: 'Variable evening dress', slug: 'variable-evening',
  type: 'Variable', price: '£999.00',
  variations: [
    { id: 20, size: 'S', colour: '', price: '£35.25', stock: 5, sku: 'S' },
    { id: 21, size: 'M', colour: '', price: '£39.75', stock: 3, sku: 'M' },
  ],
};
export const snapshot = { products: [simple, variable], categories, homePage: null, inventory: { 9001: 0, '9002:20': 0, '9002:21': 2 }, sales: { 9002: 8 },
  heroSlides: [{ id: 701, revision: 1, desktopImage: '/images/hero-desktop.webp', mobileImage: '/images/hero-mobile.webp',
    heading: "It's your moment", text: 'Standout outfits for every plan on your calendar.', ctaText: 'Shop the collection',
    ctaLink: '/shop', altText: 'A boutique outfit', textPosition: 'left', displayOrder: 0, enabled: true }],
};

export function fixtureResponse(url, options = {}) {
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    throw new Error(`SSR fixtures reject writes: ${options.method} ${url}`);
  }
  const target = new URL(url);
  switch (target.pathname) {
    case '/api/seo/resolve': {
      const route = target.searchParams.get('path');
      if (route === '/product/old-cotton') return Response.json({ status: 301, location: '/product/live-cotton' });
      if (route === '/product/missing') return Response.json({ status: 404, title: 'Not found' });
      return Response.json({ status: 200, title: 'Current public page', canonicalUrl: 'https://example.test/shop' });
    }
    case '/api/announcements': return Response.json({ announcements: [] });
    case '/api/hero-slides': return Response.json({ slides: snapshot.heroSlides });
    case '/api/catalog': return Response.json({ ...snapshot, initialized: true });
    case '/api/inventory': return Response.json({ inventory: snapshot.inventory });
    case '/api/stripe/product-sales': return Response.json({ sales: snapshot.sales });
    case '/api/shipping-methods': return Response.json({ shippingMethods: [
      { id: 'live', name: 'Merchant delivery', description: 'Current dispatch terms', price: 725, freeOver: null, enabled: true, sortOrder: 0 },
    ] });
    case '/api/return-information': return Response.json({ content: '<p>Merchant return terms. <a href="/returns" title="Returns">Read returns</a></p>' });
    case '/api/size-guide': return Response.json({ sizeGuide: [] });
    default: throw new Error(`Unexpected SSR fixture request: ${url}`);
  }
}
