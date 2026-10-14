---
name: Clerk UI upgrade policy
description: Why auth UI upgrades must be deliberate and checked against real widgets.
---

Keep the Clerk UI implementation under an exact dependency pin and upgrade it
deliberately together with verification of the real account, registration and
admin widgets.

**Why:** Clerk's remotely updated UI warned that structural appearance selectors
could break without an application release. CSS-only fixtures cannot establish
whether the actual provider markup still matches those selectors.

**How to apply:** After any deliberate UI upgrade, verify no remote UI-script
loading or structural-CSS warning, one real primary heading, embedded navigation,
readable controls and keyboard focus. Apply the merchant's latest palette and
neutral Google-button exceptions from the approved-accent guidance rather than
restoring an older auth-specific palette when resolving upgrade conflicts.
