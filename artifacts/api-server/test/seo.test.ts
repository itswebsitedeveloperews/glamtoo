import assert from "node:assert/strict";
import { test } from "node:test";
import { backfillCatalog, CatalogValidationError, prepareCatalog, type Catalog } from "../src/catalogSlugs";
import { resolveSeo, robotsTxt, seoOrigin, sitemapXml } from "../src/seo";

const origin = "https://glamtoo.webdesignessex.io";
const fixture = (): Catalog => ({
  products: [
    { id: 7, name: "Sienna Dress", slug: "sienna-dress", status: "Published", description: "<p>A lovely &amp; bright dress.</p>", image: "/assets/dress.jpg", galleryImages: ["/assets/detail.jpg"] },
    { id: 8, name: "Private Piece", slug: "private-piece", status: "Draft" },
  ],
  categories: [{ id: 1, name: "New Arrivals", description: "The newest edit." }],
});
test("social images use the public upload route and never advertise preview origins", () => {
  const catalog = backfillCatalog(fixture());
  catalog.products[0].image = "/objects/uploads/primary";
  catalog.products[0].galleryImages = ["/objects/uploads/detail"];
  const seo = resolveSeo("/product/sienna-dress", catalog, origin);
  assert.equal(seo.image, `${origin}/api/storage/objects/uploads/primary`);
  assert.deepEqual(seo.structuredData?.image, [
    `${origin}/api/storage/objects/uploads/primary`, `${origin}/api/storage/objects/uploads/detail`,
  ]);
  catalog.products[0].image = "https://preview.janeway.replit.dev/objects/uploads/primary";
  const safeFallback = resolveSeo("/product/sienna-dress", catalog, origin);
  assert.equal(safeFallback.image, `${origin}/api/storage/objects/uploads/detail`);
  assert.doesNotMatch(JSON.stringify(safeFallback), /replit\.dev/);
});
test("backfill retains product URLs and supplies durable category slugs", () => {
  const saved = backfillCatalog(fixture());
  assert.equal(saved.products[0].slug, "sienna-dress");
  assert.equal(saved.categories[0].slug, "new-arrivals");
  assert.deepEqual(saved.categories[0].slugHistory, []);
  assert.deepEqual(backfillCatalog(saved), saved);
});
test("backfill repairs unreachable duplicate and numeric slugs without stealing first owner's URL", () => {
  const existing: Catalog = {
    products: [
      { id: 7, slug: "sienna", name: "Sienna", status: "Published" },
      { id: 8, slug: "sienna", name: "Other Sienna", status: "Published" },
      { id: 9, slug: "8", name: "Cream Coat", status: "Published" },
      { id: 10, slug: "007", name: "Black Coat", status: "Published" },
    ],
    categories: [{ id: 1, name: "Dresses" }, { id: 2, name: "Dresses" }],
  };
  const repaired = backfillCatalog(existing);
  assert.deepEqual(repaired.products.map((item) => item.slug), ["sienna", "other-sienna", "cream-coat", "black-coat"]);
  assert.deepEqual(repaired.products[3].slugHistory, ["007"]);
  assert.equal(repaired.products[2].slugHistory?.length, 0);
  assert.deepEqual(repaired.categories.map((item) => item.slug), ["dresses", "dresses-2"]);
  assert.equal(resolveSeo("/product/sienna", repaired, origin).status, 200);
  assert.equal(resolveSeo("/product/8", repaired, origin).location, "/product/other-sienna");
  assert.equal(resolveSeo("/product/007", repaired, origin).location, "/product/black-coat");
  assert.deepEqual(backfillCatalog(repaired), repaired);
});
test("old clients preserve slug, history and galleries; renames record history", () => {
  const saved = backfillCatalog(fixture());
  const raw = fixture();
  raw.products[0] = { id: 7, name: "Sienna Dress", status: "Published" };
  raw.categories[0] = { id: 1, name: "Just In" };
  const oldClient = prepareCatalog(raw, saved, raw);
  assert.equal(oldClient.categories[0].slug, "new-arrivals");
  assert.deepEqual(oldClient.products[0].galleryImages, ["/assets/detail.jpg"]);
  const rename: Catalog = { products: oldClient.products.map((item) => ({ ...item, slug: item.id === 7 ? "sienna-midi" : item.slug })), categories: oldClient.categories.map((item) => ({ ...item, slug: "just-in" })) };
  const renamed = prepareCatalog(rename, oldClient, rename);
  assert.deepEqual(renamed.products[0].slugHistory, ["sienna-dress"]);
  assert.deepEqual(renamed.categories[0].slugHistory, ["new-arrivals"]);
  const olderEdit: Catalog = { products: renamed.products, categories: [{ id: 1, name: "Latest arrivals" }] };
  const stable = prepareCatalog(olderEdit, renamed, olderEdit);
  assert.equal(stable.categories[0].slug, "just-in");
  assert.deepEqual(stable.categories[0].slugHistory, ["new-arrivals"]);
  const spoofed = { ...rename, products: [{ ...rename.products[0], slugHistory: ["stolen"] }, rename.products[1]] };
  assert.deepEqual(prepareCatalog(spoofed, oldClient, spoofed).products[0].slugHistory, ["sienna-dress"]);
});
test("gallery order survives unrelated edits and explicit removals stay removed", () => {
  const saved = backfillCatalog(fixture());
  saved.products[0].galleryImages = ["/objects/uploads/front-detail", "/objects/uploads/back", "/objects/uploads/front"];
  const edit = structuredClone(saved);
  edit.products[0].price = "£39.99";
  const updated = prepareCatalog(edit, saved, edit);
  assert.deepEqual(updated.products[0].galleryImages, saved.products[0].galleryImages);
  const removal = structuredClone(updated);
  removal.products[0].galleryImages = [];
  const cleared = prepareCatalog(removal, updated, removal);
  assert.deepEqual(cleared.products[0].galleryImages, []);
  const oldClient = structuredClone(cleared);
  delete oldClient.products[0].galleryImages;
  oldClient.products[0].description = "Unrelated content edit";
  assert.deepEqual(prepareCatalog(oldClient, cleared, oldClient).products[0].galleryImages, []);
});
test("reject duplicate category IDs, slug collisions, reserved history and numeric aliases", () => {
  const saved = backfillCatalog(fixture());
  const duplicated = fixture();
  duplicated.categories.push({ id: 1, name: "Same" });
  assert.throws(() => prepareCatalog(duplicated, saved, duplicated), CatalogValidationError);
  const conflict = fixture();
  conflict.products[1].slug = "sienna-dress";
  assert.throws(() => prepareCatalog(conflict, saved, conflict), CatalogValidationError);
  conflict.products[1].slug = "7";
  assert.throws(() => prepareCatalog(conflict, saved, conflict), CatalogValidationError);
  const renamed = fixture();
  renamed.products[0].slug = "new-dress";
  const next = prepareCatalog(renamed, saved, renamed);
  renamed.products[1].slug = "sienna-dress";
  assert.throws(() => prepareCatalog(renamed, next, renamed), CatalogValidationError);
  const removed = { products: [next.products[1]], categories: next.categories };
  const taken = { products: [{ id: 10, name: "Replacement", slug: "sienna-dress", status: "Published" }], categories: next.categories };
  assert.throws(() => prepareCatalog(taken, { products: [...removed.products, next.products[0]], categories: next.categories }, taken), CatalogValidationError);
});
test("SEO handles one-hop aliases, drafts, canonical queries and pagination", () => {
  const catalog = backfillCatalog(fixture());
  catalog.products[0].slugHistory = ["old-dress"];
  catalog.products[0].slugHistory.push("Mixed-Case-Dress");
  assert.equal(resolveSeo("/product/7", catalog, origin).location, "/product/sienna-dress");
  assert.equal(resolveSeo("/product/old-dress", catalog, origin).location, "/product/sienna-dress");
  assert.equal(resolveSeo("/product/mixed-case-dress", catalog, origin).location, "/product/sienna-dress");
  assert.equal(resolveSeo("/product/private-piece", catalog, origin).status, 404);
  assert.equal(resolveSeo("/DELIVERY-RETURNS/", catalog, origin).location, "/returns");
  assert.equal(resolveSeo("//evil.example/shop", catalog, origin).status, 404);
  assert.equal(resolveSeo("/shop?sort=price&utm_source=x", catalog, origin).robots, "noindex, follow");
  assert.equal(resolveSeo("/shop?sort=price&utm_source=x", catalog, origin).canonicalUrl, `${origin}/shop`);
  assert.equal(resolveSeo("/shop?page=2", catalog, origin).robots, "noindex, follow");
  for (const invalid of ["0", "-1", "abc", "1&page=2"]) {
    assert.equal(resolveSeo(`/shop?page=${invalid}`, catalog, origin).robots, "noindex, follow");
    assert.equal(resolveSeo(`/shop?page=${invalid}`, catalog, origin).canonicalUrl, `${origin}/shop`);
  }
  assert.equal(resolveSeo("/shop?page=1&utm_source=x", catalog, origin).canonicalUrl, `${origin}/shop`);
  assert.equal(resolveSeo("/cart", catalog, origin).robots, "noindex, follow");
  assert.equal(resolveSeo("/product/sienna-dress", catalog, origin).description, "A lovely & bright dress.");
  catalog.products.push(...Array.from({ length: 12 }, (_, id) => ({ id: id + 20, slug: `piece-${id}`, status: "Published", name: `Piece ${id}` })));
  assert.equal(resolveSeo("/shop?page=2&utm_source=x", catalog, origin).canonicalUrl, `${origin}/shop?page=2`);
  assert.notEqual(resolveSeo("/shop?page=2", catalog, origin).title, resolveSeo("/shop", catalog, origin).title);
  assert.equal(resolveSeo("/shop?search=dress&page=999", catalog, origin).robots, "noindex, follow");
  assert.equal(resolveSeo("/shop?search=dress&page=999", catalog, origin).canonicalUrl, `${origin}/shop`);
  assert.equal(resolveSeo("/shop?category=dresses&page=2", catalog, origin).canonicalUrl, `${origin}/shop`);
  catalog.products[0].image = "";
  assert.equal(resolveSeo("/product/sienna-dress", catalog, origin).image, `${origin}/assets/detail.jpg`);
});
test("discovery allows crawling noindex pages without advertising any sitemap URLs", () => {
  const xml = sitemapXml(backfillCatalog(fixture()), origin);
  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"><\/urlset>/);
  assert.doesNotMatch(xml, /<url>|<loc>/);
  assert.throws(() => seoOrigin("https://evil.example/path"));
  assert.equal(seoOrigin(origin), origin);
  assert.match(robotsTxt(origin), /Disallow: \/api\//);
  assert.doesNotMatch(robotsTxt(origin), /Disallow: \/checkout/);
  assert.doesNotMatch(robotsTxt(origin), /Sitemap:/);
  assert.match(robotsTxt(origin), /Allow: \//);
});

test("all resolver outcomes remain noindex without losing pagination or aliases", () => {
  const catalog = backfillCatalog(fixture());
  for (const path of ["/", "/shop", "/category", "/about", "/faq", "/contact", "/privacy", "/terms",
    "/returns", "/delivery-returns", "/account", "/register", "/sign-in", "/checkout", "/cart",
    "/wishlist", "/admin/orders", "/missing", "/product/sienna-dress", "/product/7",
    "/product/private-piece", "/category/new-arrivals", "/shop?page=1", "/shop?page=999",
    "/shop?stock=in", "/bad%"]) {
    assert.match(resolveSeo(path, catalog, origin).robots, /^noindex, (?:follow|nofollow)$/, path);
  }
  assert.equal(resolveSeo("/", catalog, origin).image, `${origin}/social-home.webp`);
});

test("Product data uses real identity and verified simple/variable checkout offers only", () => {
  const catalog = backfillCatalog(fixture());
  const product = catalog.products[0];
  Object.assign(product, { type: "Simple", price: "£49.99", stock: 99, sku: "SIENNA" });
  const read = (inventory?: Parameters<typeof resolveSeo>[3]) =>
    resolveSeo("/product/sienna-dress", catalog, origin, inventory).structuredData!;
  assert.equal(read()["@type"], "Product");
  assert.equal(read().description, "A lovely & bright dress.");
  assert.equal(read().offers, undefined, "no unverified stock or prices");
  assert.deepEqual(read({ "7": { unitAmount: 4999, stock: 0 } }).offers,
    [{ "@type": "Offer", url: `${origin}/product/sienna-dress`, priceCurrency: "GBP", price: "49.99", availability: "https://schema.org/OutOfStock", sku: "SIENNA", seller: { "@type": "Organization", name: "Glam Too", url: origin } }]);
  product.salePrice = "£39.99";
  assert.equal(read({ "7": { unitAmount: 4999, stock: 1 } }).offers, undefined, "conflicting display/checkout prices omitted");
  assert.equal((read({ "7": { unitAmount: 3999, stock: 1 } }).offers as any[])[0].price, "39.99");
  product.type = "Variable";
  product.variations = [
    { id: 1, price: "£20", stock: 0, sku: "S" },
    { id: 2, price: "£25", stock: 1, sku: "L" },
    { id: 3, price: "not a price", stock: 5 },
  ];
  const offers = read({ "7:1": { unitAmount: 2000, stock: 2 }, "7:2": { unitAmount: 2500, stock: 0 }, "7:3": { unitAmount: 999, stock: 5 } }).offers as any[];
  assert.deepEqual(offers.map((offer) => [offer.price, offer.availability, offer.sku]),
    [["20.00", "https://schema.org/InStock", "S"], ["25.00", "https://schema.org/OutOfStock", "L"]]);
  assert.equal(read().offers, undefined);
  for (const invented of ["aggregateRating", "review", "brand", "size", "seller", "shippingDetails"]) assert.equal(read()[invented], undefined);
  product.image = "javascript:alert(1)";
  product.galleryImages = ["//evil.test/image", "data:image/png;base64,AAA", "https://images.example/a.jpg"];
  assert.deepEqual(read().image, ["https://images.example/a.jpg"]);
  product.image = "/@fs/home/runner/workspace/attached_assets/photo.webp";
  assert.deepEqual(read().image, ["https://images.example/a.jpg"], "Vite paths are never public production media");
  assert.equal(resolveSeo("/product/sienna-dress", catalog, origin).image, "https://images.example/a.jpg");
  assert.ok(resolveSeo("/about", catalog, origin).structuredData?.["@graph"]);
  assert.equal(resolveSeo("/product/private-piece", catalog, origin).structuredData, undefined);
});