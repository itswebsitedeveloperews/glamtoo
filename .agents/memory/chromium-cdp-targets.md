---
name: Chromium CDP preview checks
description: Avoiding misleading browser targets and asynchronous scroll captures
---

When connecting to headless Chromium through its remote-debugging endpoint, select the target with `type: "page"` and the intended app URL (or the blank page before navigating). Do not assume the first target is the app page.

**Why:** Chromium in this environment may list omnibox popup targets first. Driving one of those produces misleading viewport and DOM results and can leave screenshot capture waiting indefinitely.

**How to apply:** Inspect the remote debugger's target list before opening a WebSocket, select the real page, and then set viewport emulation and navigate.

For page-bottom captures, request instant scrolling rather than assuming a successful JavaScript scroll command has already moved the viewport.

**Why:** A smooth-scroll animation can start after CDP evaluation returns, so an immediate screenshot shows the old page position even though the command succeeded.

**How to apply:** Use `window.scrollTo({ top, behavior: 'instant' })` and verify `scrollY` and the target's bounding rectangle before capturing.

In the external proxied development preview, distinguish Replit's development
banner from shop controls when investigating failed pointer clicks.

**Why:** The banner has intercepted clicks on the product lightbox's top-right
close button at tablet width. That is separate from application focus failures.

**How to apply:** Inspect the hit target and verify keyboard dismissal separately.
Do not change approved shop styling or force clicks through an overlay to claim
the actual pointer path works.
Foreground CSS-only Playwright pages before measuring pointer pseudo-states.

**Why:** With the workspace's headless Chromium, `setContent()` on an
unforegrounded blank page accepted pointer actions but left both `:hover` and
`:active` false, even on a plain button. Bringing the page to the front restored
real pointer states.

**How to apply:** Call `page.bringToFront()` for isolated blank-page fixtures,
then assert the intended pseudo-state before reading computed styles. Keep
hover, keyboard focus and pressed states separate so they cannot mask each other.
