# Inbox loading and cache

`GET /api/state?view=inbox` builds an authorized chat snapshot without publishing
history, copy jobs, shipping integrations or POS account hydration. It includes
one authorized conversation window (at most 60 messages plus quotes and pins).
The existing state cache remains per user, role, view and revision. Publishing
writes no longer invalidate inbox snapshots. Permission and channel changes do.

SQLite automatically creates `kind_revision` and `chat_message_revision` metadata
tables and two indexes for local/native pinned messages. Triggers invalidate
counters on insert, update and delete, including raw SQL changes. Counters are
created lazily on writes; no backfill or duplicate message payload is needed.
Unchanged live polls read a conversation counter instead of scanning all message
IDs. Care lookups cache only relevant record kinds and never cache transactions
that might roll back. No Supabase migration or manual SQL is required.

The browser keeps up to 12 opened conversation windows in session memory. It
clears unauthorized conversations on state refresh and clears everything when
the signed-in user changes. Older history stays available through cursor paging;
explicit full-history search is unchanged. Idle typing polling is limited to
once per three seconds; active typing and live message polling are preserved.

Validation:

```
node --test tests/inbox-snapshot.test.mjs tests/chat-window.test.mjs tests/chat-live-audit.test.mjs tests/student-care.test.mjs
node scripts/test-inbox-performance.mjs
node scripts/test-chat-ui.mjs
node scripts/test-fold-navigation.mjs
```

The performance fixture has 40 conversations, 10,000 messages and 1,000 unrelated
posts. On the development machine, workspace JSON was 3,227,038 bytes / 80 ms;
inbox JSON was 71,873 bytes / 15 ms. These are local measurements, not production
latency guarantees. Ignored test-results contains timing and UI reports.

Deployment requires both Vercel frontend and VPS backend updates. Health must
report `features.inboxCompact` and `features.chatRevisionCounters` true. Android
TWA receives the same frontend from the website on reload; no APK change is
needed. Confirm live authenticated inbox timings after VPS deployment.
