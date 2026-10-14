# Admin enquiry notification operations

## Scope and authorization

New enquiries and their alert jobs commit in one transaction. A job is created
only if the saved admin recipient is explicitly enabled at submission time.
Saving settings never scans or replays old enquiries, and does not change
order-email recipient restrictions.

Each recipient and its globally unique RFC Message-ID are fixed when the job is
created. Changing the recipient affects new enquiries only. Disabling alerts
pauses pending jobs; re-enabling resumes them with their **original recipient**.
An already-started SMTP send cannot be cancelled by a settings change.
Missing Gmail authorization keeps jobs pending without consuming send attempts.

## Worker safety

The API runs the worker at startup and every 30 seconds. Database claims use
`FOR UPDATE SKIP LOCKED`, a unique lease token, and a five-minute expiry.
Leases have two phases:

- `leased`: SMTP has not started. An expired claim can safely return to pending.
- `sending`: saved before calling SMTP. Expiry becomes `uncertain`, never pending.

Transitions check the lease token. A stale worker cannot send from an expired
pre-send claim or overwrite a frozen outcome. Job and enquiry status changes
are atomic, with per-enquiry locking to preserve independent recipient outcomes
under concurrent workers. Full enquiry contents remain available in the admin inbox regardless
of delivery status; details include the saved Message-ID and sanitized errors.

Only proven pre-submission failures (DNS, refused connection, setup timeouts)
and explicit temporary SMTP rejection responses can retry. Backoff is 60, 120,
240, then 480 seconds, with a maximum of five SMTP attempts. Authentication and
permanent rejections fail immediately. An unknown exception, post-DATA socket
loss (including Nodemailer's `CONN` label), or inability to save SMTP acceptance
does not cause an automatic resend.

## Reconciling an uncertain outcome

1. Open the enquiry details in the protected admin inbox. Preserve its Message-ID.
2. Inspect the outbox records in the appropriate database using authorized,
   read-only access. Use `enquiry_id` and the job's `id` to locate its original `recipient`,
   `message_id`, `status`, `attempts`, and `last_error`; do not rely on the
   current recipient settings.
   Each recipient has an independent job, so reconcile every uncertain recipient.
   Never reset all of an enquiry's jobs to resend one failed recipient.
3. Search the authorized Gmail sender's Sent mail with
   `in:sent rfc822msgid:MESSAGE_ID_WITHOUT_ANGLE_BRACKETS`. Confirm the recipient
   and enquiry tag. SMTP acceptance or a Sent item is not proof of inbox delivery.
4. Leave the job frozen while evidence is inconclusive. The Message-ID supports
   investigation; it is **not** an SMTP idempotency key or a deduplication guarantee.
   This change intentionally provides no automatic resend endpoint. Any manual
   resend requires separate authorization and evidence that it will not duplicate
   an accepted message.

Do not reset legacy `sending`, `uncertain`, `failed`, or `not_configured` enquiries
into new jobs. There is no historical backfill.

## Verification

`pnpm --filter @workspace/api-server run test:contact-notifications` uses the
disposable database runner. It requires `TEST_DATABASE_ADMIN_URL` pointing to
an owned loopback PostgreSQL cluster, creates and drops its own database, and
mocks SMTP and authentication. It does not use application provider credentials
or send real email. Apply the additive schema before starting the new API;
the existing post-merge setup runs the development schema push.
