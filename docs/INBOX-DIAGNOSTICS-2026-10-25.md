# Inbox diagnostics and refresh load

The channel status screen was only embedded at the bottom of the filter form.
It is now directly available from Inbox → Quản lý → Trạng thái kênh / Đồng bộ.
Instagram shows the stored synchronization error and last message webhook time.
This is diagnostic evidence, not proof that a real customer exchange succeeded.

Performance changes:

- Inbox SSE revisions track Inbox data and messages, excluding publishing history,
  provider import cursors and webhook diagnostic writes.
- Identical active webhook replay does not update the conversation version.
- Ordinary duplicate receipts use the conversation/external-ID index first;
  album receipt lookup remains available as a fallback within that conversation.
- Care policies are reused for an unchanged complete source snapshot for up to
  30 seconds. Record/staff changes invalidate immediately. Task deadlines are
  still checked at request time; channel authorization remains unchanged.

Read-only server diagnostics (run from repository root):

    node scripts/diagnose-inbox.mjs

This opens SQLite read-only and reports collection sizes/read time, provider sync
errors, webhook timestamps and aggregate chat counts. It omits tokens, customer
names, message content and remote peer IDs. No database schema changes are needed.
It does not measure external proxy/network latency or total Inbox assembly time.

Validation: 43 focused backend tests, npm run check and isolated local
scripts/test-fold-navigation.mjs at phone 390, touch 840/1100 and desktop mouse.
Real Instagram receive/send still requires production provider diagnostics and
an authorized customer exchange. Browser/local tests are not physical Fold tests.
