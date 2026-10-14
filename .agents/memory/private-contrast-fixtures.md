---
name: Private contrast fixtures
description: Non-obvious Clerk bootstrap and rendered-state constraints for isolated contrast checks.
---

Keep real Clerk UI rendering while replacing its auth responses with synthetic signed-out settings and clients.

**Why:** Development Clerk bootstrap requests environment settings using POST as well as GET. Blocking that settings POST can leave a superficially working widget with default labels and missing social controls, so a contrast test can accidentally measure a different dialog.

**How to apply:** Mock the development-browser bootstrap and both environment methods locally; block all actual sign-in, registration, session, and payment mutations. Assert the expected named controls appear before checking contrast. Never save captured auth clients or session material as fixtures.

Measure settled hover and keyboard focus states separately.

**Why:** Clerk can serialize hover colors as OKLab, and its foreground/background transitions can finish at different times. Sampling an arbitrary transition frame is not a deterministic measurement of either state.

**How to apply:** Convert computed modern colors through the browser's color implementation and await finite CSS animations before measuring each state. Require normal-size AA regardless of heading size, and prove the oracle rejects known low-contrast foreground regressions.
