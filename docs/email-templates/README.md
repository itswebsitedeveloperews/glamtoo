# Clerk account-email branding handoff

## Delivered

`clerk-verification.revolvapp.html` is a manually applied Clerk/Revolvapp
verification-code template, styled to match the existing contact and order
emails. It is not an app runtime template and is not automatically uploaded.
The supplied logo is `artifacts/api-server/src/assets/email-wordmark.png`.

The template retains the supplied Clerk placeholders, account-security warning,
request origin and request time. Its markup structure and shared branding values
were checked locally; Clerk rendering and inbox delivery were not verified.
No authentication methods, app email delivery, or provider settings were changed
by this work.

## Closure status

The merchant subsequently explicitly requested closing this task without
verification. Closure therefore accepts the delivered template and documented
handoff, not completion of the outstanding provider work below. Live branding
application and saved Production previews remain unconfirmed; no additional
provider changes or verification were performed for closure.

The merchant requested closure after the dashboard reported
**"Current user is missing an organization permission."**
The exact settings action that produced the error was not established.
Successful dashboard access does not prove permission to save branding.

This handoff records template delivery only. It is **not evidence that the logo,
sender name, templates or colors were saved in Production**, or that all enabled
account-email categories match the shop. The supplied editor screenshot showed
Development and the original template; no saved branded Production preview was
provided.

### Access recheck — 15 October 2026

The managed-Clerk access check returned `status: managed` and
`dashboardAccess: authorized`. This confirms eligibility to open the managed
dashboard only; it does not establish permission to upload the logo or save
email settings. No authenticated dashboard editor or saved Production preview
was available to the agent in this session.

No provider changes or test sends were performed. The previously reported
permission error has not been reproduced or confirmed resolved. Production
sender identity, logo, colors, enabled-template inventory and rendered previews
remain unverified. No addresses, verification codes or recovery links were
collected.

To resume, use the authorized managed Production email-customization entry
point. If the error persists, record the exact failing action and environment
with a redacted screenshot for Replit Support; do not change keys, app-user
roles, authentication methods or delivery settings to work around it.

## Remaining provider work

1. Read the current `clerk-auth` skill and check management status. Resolve the
   denied dashboard-settings action through authorized managed-Clerk access or
   Replit Support; do not change Clerk keys, app-user roles or auth providers.
2. With the merchant's authorization, apply the supplied PNG, sender display name
   **Glam Too Boutique**, pink **#e23d6f** and cream **#f5f1ed** to the appropriate
   provider settings. A template's internal Name field is not its sender name.
3. Preview this template in Clerk before saving. `{{> app_logo}}` uses the
   application's configured logo; this source file does not upload it.
4. Identify the existing enabled verification, registration, sign-in and
   password-recovery email templates. Apply matching presentation while
   preserving each template's own variables, security content and purpose.
   Do not paste the verification-code template into unrelated email types.
5. Confirm saved Production settings and rendered previews, recording which
   enabled categories were inspected. Redact addresses, codes and recovery
   links from evidence. Keep Clerk delivery enabled; do not enable new
   authentication methods or send test messages without authorization.

Password-recovery functional testing is a separate deliverable. It is not
established by reviewing email branding.
