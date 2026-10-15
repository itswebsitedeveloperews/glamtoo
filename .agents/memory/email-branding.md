---
name: Email branding scope
description: Merchant wants shop branding on every outbound email category.
---

Apply the site's Glam Too branding to customer-account emails, contact emails,
login and registration emails, and all other email types. Account-email designs
must match the existing contact and order emails, rather than use a separate
visual design.

**Why:** The merchant explicitly requested consistent site branding across all
emails, not only order confirmations.

**How to apply:** New email types should match the existing site identity.
Branding changes do not authorize creating new automatic messages, changing
recipient restrictions, replaying historical notifications, or migrating email
providers. Distinguish app templates from provider-managed account templates
when reporting what was actually applied.

For Clerk dashboard guidance, distinguish the template list from the template
editor. The template's **Name** field is an internal label, not the email sender
display name; the email logo comes from application branding.

**Why:** These similarly named controls can appear to satisfy branding without
changing what recipients see.

**How to apply:** Open the enabled template before describing its controls, and
verify sender identity and the rendered logo rather than relying on template
labels or the app's embedded sign-in appearance.

Dashboard access authorization does not prove permission to save application
branding settings.

**Why:** The merchant could open the managed dashboard but encountered
"Current user is missing an organization permission" on its branding page.

**How to apply:** Establish which action failed (logo upload versus Clerk-branding
removal) before recommending a fix. Do not change auth keys or app-user roles,
or treat embedded sign-in appearance as an email-logo fix.
