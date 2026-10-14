---
name: Contact alert authorization snapshots
description: Recipient-change and disable semantics for already authorized enquiry notifications.
---

An enquiry alert's recipient is authorized and fixed at submission. Disabling
notifications pauses unsent jobs, while re-enabling resumes previously authorized
jobs for their original recipients; it must not retarget them to the new setting.
Do not create notification jobs for historical enquiries.

**Why:** Durable retries must preserve the original intended recipient and must
not turn saving settings into permission to resend historical customer messages.

**How to apply:** Keep settings changes separate from job creation and recipient
selection. Explain the pause/resume behavior when changing admin notification
controls. Freeze uncertain SMTP outcomes rather than automatically resending.
