---
name: Catalog URL and SEO policy
description: Stable slugs, redirect history, and HTTP-serving constraints for Glam Too.
---

Keep the existing /product/ and /category/ URL formats. Category name changes must not change their URLs. Explicit slug changes retain server-owned history and reserve old URLs against reassignment.

**Why:** The user requested fixing SEO and URL stability without unnecessarily breaking existing links. Slug history can only preserve addresses known since tracking began; do not claim recovery of unknown older URLs.

**How to apply:** Keep canonical resolution and redirects consistent with published catalog visibility. Use the verified production origin, never a browser Host or development domain.

Keep the entire Glam Too website noindex until the user explicitly requests a policy change. Public crawling must remain permitted so crawlers can discover noindex; sitemaps stay empty and are not advertised.

**Why:** The user's pre-launch requirement is site-wide noindex, not merely private-page exclusions. Accurate product and social metadata does not authorize enabling indexing or promising immediate removal of previously indexed pages.

**How to apply:** Preserve titles, canonicals, pagination and slug redirects independently of indexing policy. Do not restore index directives when fixing metadata or choosing a final domain.

Serve document metadata and redirects through the web server, not a static SPA fallback. Development middleware must exclude Vite runtime endpoints, including React Refresh.

**Why:** Static hosting cannot return dynamic redirect or not-found statuses, and intercepting development runtime modules prevents React from loading.

**How to apply:** Preserve the server-based production configuration and verify initial HTTP responses as well as client navigation when changing routing.