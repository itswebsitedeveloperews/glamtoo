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

The merchant requested closure after the dashboard reported
**"Current user is missing an organization permission."**
The exact settings action that produced the error was not established.
Successful dashboard access does not prove permission to save branding.

This handoff records template delivery only. It is **not evidence that the logo,
sender name, templates or colors were saved in Production**, or that all enabled
account-email categories match the shop. The supplied editor screenshot showed
Development and the original template; no saved branded Production preview was
provided.

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
