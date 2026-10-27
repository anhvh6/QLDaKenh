# Publishing and latency audit — 2026-10-27

Production observations before this release:

- The latest Instagram/Threads failures are terminal media-container processing failures, with stored messages ERROR and UNKNOWN. This does not establish a codec, media-download or Meta infrastructure root cause. The Instagram status detail was discarded by the connector.
- Eight paired public health probes, simultaneous within each pair: Vercel [4067,218,102,95,118,4476,202,146] ms; direct VPS HTTP [3969,29,27,38,87,3689,34,38] ms. Medians: 174 and 38 ms. Both paths stalled together. HTTP and HTTPS, different connection reuse and the small health payload prevent treating the difference as an exact proxy overhead or a state-page benchmark.
- Owner-only live system metrics: CPU 85.2%, memory 42.4%, current event-loop maximum 4337 ms; maximum across 360 samples 5943 ms. All 360 samples exceeded 500 ms. These observations establish backend event-loop stalls, not the identity of a particular worker.
- Instagram comment sync was ready; Threads and one Facebook connection were still backfilling. Another Facebook connection, X, one YouTube connection and Blogger reported errors. These need provider-specific permission/quota diagnosis; speeding up polling cannot grant permissions.

Changes:

1. Preserve Instagram status detail and structured terminal processing failures, redact media URLs, and guard PUBLISHED containers on both Meta providers against duplicate writes.
2. Explicit retry removes stale container/carousel/verification/deadline state. A confirmed terminal generic ERROR/UNKNOWN processing failure may recreate the unpublished container once after 60 seconds. Specific format/auth errors and ambiguous publish receipts never use this recovery path; a second generic failure stops.
3. Instagram comment reads use at most three concurrent requests and yield between imported messages. Transient network errors retry after 30 seconds instead of five minutes; quota/auth backoffs remain.
4. During Facebook/Threads backfill, poll the two current posts at most once per minute without advancing historical cursors, so new comments do not wait for the whole history scan.
5. JSON Server-Timing app duration and bounded worker counters expose synchronous start blocking separately from total async elapsed time. Async continuations can still block; these counters are diagnostic signals, not a complete CPU profile.
6. Read-only scripts diagnose existing failed Meta containers/media range access and compare paired public API routes. They do not publish, retry existing failed jobs, or print credentials/message content.

Validation: 73 targeted tests pass, including actual persisted retry cleanup, bounded generic recovery, uncertain write protection, comment cursor isolation, draining concurrent failures, gzip/timing and worker timing. npm run check passes. Stale test expectations for existing chat-usage fields, Bluesky chat and Tumblr comments were updated; production capabilities were not changed.

Rollout: backend only; frontend source/bundle unchanged. VPS must pull/restart before new features exist on web or Android TWA. Verify /api/health features publishingProcessingDiagnostics, commentReadBatch and serverTiming. Then run node scripts/diagnose-publishing.mjs and inspect /api/system/metrics workers after 1–2 minutes. Automatic SSH authentication was refused during the audit; no production backend rollout claimed.

Recommendations, in order:

- Identify and reduce the synchronous worker hotspot using new metrics; move CPU-heavy aggregation/transcoding to a separate worker process after identifying ownership, retaining database locks and publication idempotency.
- Keep the static frontend CDN. Consider a separate owned HTTPS API/SSE/media hostname pointing at the VPS or object storage to bypass the external proxy for large video transfers; no DNS, TLS or storage change was made.
- Use signed provider webhooks for current messages/comments, polling as recovery. Current polling floors remain Instagram 30 seconds and Threads 60 seconds; webhook arrival, provider API latency and backend stalls all contribute to delay.
- Do not cache private data publicly or add another cache table until the blocking path is measured. Existing compact snapshots/caches cannot make a blocked Node event loop respond.

Reference: https://vercel.com/docs/routing/rewrites (external reverse proxy); https://vercel.com/docs/limits (external proxy timeout). External proxy timeout alone does not prove either observed media failure was caused by Vercel.
