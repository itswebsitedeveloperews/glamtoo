---
name: Contact submission semantics
description: Defines when the customer contact form may show a successful-submission message.
---

Persist every valid contact enquiry before returning success. Treat administrator email delivery as a separate best-effort step that cannot turn a stored submission into a customer-facing failure.

**Why:** Email-provider configuration or temporary delivery failures should not prevent customers from submitting an enquiry, but success must never be shown if the message would be lost.

**How to apply:** Return success only after the database insert completes. Record delivery status separately, and reserve customer-facing errors for validation, rate limiting, or persistence failures.