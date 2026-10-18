# Initial load stalls — 18 October 2026

Production HTTP logs recorded state requests taking 22–56 seconds. A 15-second CPU sample showed most execution in `store.all()` / JSON parsing, called repeatedly by comment ingestion. Each synchronized comment parsed the entire 36,434-message history, even when the comment already existed. A page of 50 comments could block unrelated HTTP requests for many seconds.

Comment ingestion now looks up external IDs using a partial index, scopes receipt and pending-send reconciliation to comment conversations on the same channel, and yields to I/O between Facebook/Threads comments. Webhook deletion also uses scoped queries. Existing attribution, deduplication, pagination, edits and deletion semantics are retained.

SQLite needs both an explicit channel-first join and `=+c.id` in the receipt fallback. Without removing the TEXT affinity of `c.id`, it scans the message expression index instead of searching it. Regression coverage checks the actual query plan and ensures unrelated history is never parsed in JavaScript.

On a production database copy: the previous lookup took 7,301 ms for 10 comments; the indexed missing-ID receipt fallback took 119 ms for 10 lookups. These are server-side lookup timings, not full browser load times. The read-only `scripts/benchmark-comment-lookup.mjs` reproduces comparisons without printing customer content or sending messages.

Before deployment, back up SQLite and check that no order/message dispatch is in flight. Keep POS sync enabled. Verify health, benchmark again, and inspect the authenticated UI after deployment.
