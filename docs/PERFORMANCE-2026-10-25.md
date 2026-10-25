# Loading performance audit — 2026-10-25

## Coverage

Read-only walkthrough of production main pages and local automated navigation through 15 routes: dashboard, content, calendar, media, handoffs, campaigns, comments, inbox, phacdo, products, orders, shipping, automation, reports and settings. Phacdo embeds a separate application; outer-page readiness does not measure completion of its remote learner queries. No production messages or posts were sent.

## Findings and changes

- API JSON already uses gzip. Dashboard numeric results already persist in `dashboard_aggregates`; adding another copy of the same aggregates would not address navigation waits.
- The browser previously discarded page snapshots on navigation, often waiting for a full state download again. Snapshots now remain in document memory, isolated by account, role and CSRF session. Cached pages paint while their server revision is checked in the background.
- Cache limits: 12 views, 2-minute freshness and an approximate 20 MiB serialized-data budget. No private workspace snapshots are written to localStorage, disk or the service worker. Writes, uploads, logout and observed authorization-scope changes invalidate cached pages; responses from before invalidation cannot repopulate them. An unchanged server revision renews freshness.
- Calendar, products and reports now have dedicated state projections. Calendar preserves appointment scope, copy schedules and full post editing data. Reports return numeric aggregates and the order-source table instead of chat/customer/publication bodies. Catalog loads only its editing data.
- Content revisions no longer depend on message-body/read-receipt writes or unrelated dashboard aggregate timestamps. Relevant data and access changes still invalidate server snapshots.
- Content cards and status filters use one publication index per array rather than scanning the entire publication history for every card.
- All compact views now wait for their own data on first entry, preventing temporary empty results from a different view.

## Reproducible evidence

`scripts/benchmark-workspace-load.mjs` uses synthetic local data: 1,000 contents/publications/customers, 300 conversations and 12,000 messages. State requests in browser navigation have an artificial 200 ms delay. API payload bytes are uncompressed JSON; they are not actual WAN transfer sizes.

| Scenario | Before | After |
| --- | ---: | ---: |
| Return to Content, first data paint | 294 ms | 30 ms |
| Return to Calendar, first data paint | 299 ms | 28 ms |
| Return to Media, cached first paint | — | 10 ms |
| Return to Comments, cached first paint | — | 20 ms |
| Return to Inbox, cached first paint | — | 85 ms |

The old early paint for several compact pages could be an empty intermediate result, so those old values are deliberately not compared as data-ready timings. Background fresh-data validation still waits for the simulated network.

`scripts/test-navigation-cache.mjs` independently delays state requests by 600 ms: cached Content paints in approximately 10–11 ms, and a favorite edit correctly forces fresh data instead of reusing invalidated cache.

Report and catalog payloads in this fixture are about 5.6 KB and 5.4 KB, respectively, instead of loading the approximately 2.98 MB shared workspace. These fixture catalogs/order lists are empty; real payload size grows with the actual catalog and order-source rows.

Validation includes snapshot scoping and report parity, cache account/session isolation, expiry, late responses, write invalidation, content editing, chat/comment sending, keyboard behavior, calendar appointments and responsive navigation at 390/840/1100 px and desktop. These are browser tests, not physical Samsung Fold 7 tests.

## Deployment boundary

Frontend changes reach the website and Android TWA through the same Vercel origin. Dedicated API views require the new VPS backend. First visits, expired cache and external integrations still require network access; a cached paint is not a guarantee that remote data is already fresh.
