---
name: Contact form spam protection
description: Explains why the contact form relies on rate limiting rather than a hidden honeypot field.
---

Do not add a hidden honeypot input to the customer contact form; retain server-side rate limiting as its baseline abuse protection.

**Why:** Browser autofill populated the hidden field during valid submissions, causing the server to reject legitimate enquiries with a generic validation error.

**How to apply:** Keep spam controls independent of invisible user-editable form fields. If stronger protection becomes necessary, use a server-verifiable challenge or risk signal that cannot be populated by browser autofill.