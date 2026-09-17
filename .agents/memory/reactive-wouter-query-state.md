---
name: Reactive Wouter query state
description: How query-driven storefront views must react to client-side URL updates in this Wouter setup.
---

When filters, sorting, pagination, or other UI state is stored in URL query parameters, subscribe to the router's search value rather than reading `window.location.search` during a render triggered only by pathname location.

**Why:** Client-side navigation can update the query string without changing the pathname. Components subscribed only to pathname location may not rerender, leaving the URL correct while the visible results remain stale.

**How to apply:** For any query-driven view, use Wouter's reactive search hook as the source for `URLSearchParams`. Keep client-side navigation for shareable URLs and Back/Forward support.