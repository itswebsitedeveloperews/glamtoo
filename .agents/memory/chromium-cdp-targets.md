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