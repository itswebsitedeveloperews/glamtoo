---
name: Clerk recovery flow API
description: Custom password recovery needs the signal-based Clerk API used by this project.
---

Use the `useSignIn()` signal resource’s dedicated `resetPasswordEmailCode` methods (`sendCode`, `verifyCode`, `submitPassword`) and `finalize()` for password recovery, rather than classic `prepareFirstFactor` or `setActive` examples.

**Why:** The installed Clerk React SDK exposes the newer signal-based authentication API; classic hook examples typecheck incorrectly and do not match its runtime flow.

**How to apply:** When changing a bespoke customer auth form, check the installed SDK types first and keep password/reset codes entirely within Clerk’s browser flow—never handle them in the app API or local storage.