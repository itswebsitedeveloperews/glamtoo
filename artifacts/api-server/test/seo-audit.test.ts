import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSeo } from "../src/seo";
const catalog = { products: [], categories: [] };
const origin = "https://glamtoo.webdesignessex.io";

test("private page metadata is unique and contains no personal query values", () => {
  const paths = ["/account", "/register", "/account/recovery", "/cart", "/wishlist", "/checkout", "/order-confirmation", "/admin"];
  const pages = paths.map(path => resolveSeo(path, catalog, origin));
  assert.equal(new Set(pages.map(page => page.title)).size, paths.length);
  assert.equal(new Set(pages.map(page => page.description)).size, paths.length);
  pages.forEach(page => {
    assert.equal(page.robots, "noindex, follow");
    assert.equal(page.structuredData, undefined);
  });
  const order = resolveSeo("/account?section=orders&order=private-reference&email=private@example.test", catalog, origin);
  assert.equal(order.title, "My Orders | Glam Too");
  assert.equal(order.canonicalUrl, `${origin}/account`);
  assert.doesNotMatch(JSON.stringify(order), /private-reference|private@example/);
  assert.equal(resolveSeo("/sign-in/verify", catalog, origin).canonicalUrl, `${origin}/account`);
  assert.equal(resolveSeo("/sign-up/verify", catalog, origin).canonicalUrl, `${origin}/register`);
  assert.equal(resolveSeo("/account?section=__proto__", catalog, origin).title, "My Account | Glam Too");
});
test("public schema is factual and private or missing pages never inherit it", () => {
  for (const path of ["/", "/shop", "/category", "/about", "/contact", "/faq", "/privacy", "/terms", "/returns"]) {
    const page = resolveSeo(path, catalog, origin);
    assert.equal(page.status, 200);
    assert.equal(page.structuredData?.["@context"], "https://schema.org");
    const graph = page.structuredData?.["@graph"] as Array<Record<string, unknown>>;
    assert.deepEqual(graph.slice(0, 2).map(node => node["@type"]), ["Organization", "WebSite"]);
    assert.equal(graph[2].url, page.canonicalUrl);
    assert.doesNotMatch(JSON.stringify(graph), /aggregateRating|reviewCount|streetAddress/);
    assert.match(page.robots, /^noindex/);
  }
  for (const path of ["/missing", "/admin/not-a-route"]) {
    const page = resolveSeo(path, catalog, origin);
    assert.equal(page.status, 404);
    assert.equal(page.canonicalUrl, "");
    assert.equal(page.robots, "noindex, nofollow");
    assert.equal(page.structuredData, undefined);
  }
});
