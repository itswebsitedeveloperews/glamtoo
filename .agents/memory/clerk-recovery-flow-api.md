---
name: Clerk recovery flow API
description: Custom password recovery needs the signal-based Clerk API used by this project.
---

Use the `useSignIn()` signal resource’s dedicated `resetPasswordEmailCode` methods (`sendCode`, `verifyCode`, `submitPassword`) and `finalize()` for password recovery, rather than classic `prepareFirstFactor` or `setActive` examples.

**Why:** The installed Clerk React SDK exposes the newer signal-based authentication API; classic hook examples typecheck incorrectly and do not match its runtime flow.

**How to apply:** When changing a bespoke customer auth form, check the installed SDK types first and keep password/reset codes entirely within Clerk’s browser flow—never handle them in the app API or local storage.

Preserve signal API validation errors rather than replacing them with a generic status failure. ClerkError has user-facing `longMessage`, may wrap legacy API errors in `cause`, and exposes field-specific messages through the hook's error signal. Do not display its developer-facing `message`.

**Why:** Real password-reset requests were rejected with HTTP 422, but the custom form discarded the provider reason, leaving customers unable to correct their password.

**How to apply:** Throw returned provider errors before checking status; keep security verification separate from session finalization. An activation failure after a completed reset must not say the password was rejected. Test credentials only with fresh development fixtures; never change existing customer passwords to verify a fix.