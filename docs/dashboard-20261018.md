# Compact dashboard and initial loading

- `GET /api/state?view=dashboard` returns metadata for the last message of conversations active within seven days. It does not read or send complete message history. The full snapshot remains the default for other pages. Cache/revision keys include the snapshot view and user; switching from the dashboard waits for a full snapshot before rendering chat/details.
- Production read-only measurement: selecting recent last-message metadata returned 15 rows in 34 ms on the 36,434-message database. Actual end-to-end time also includes authorization, other workspace data, transport and rendering.
- The browser entry bundles 77 source modules into one JavaScript request: about 750 KB uncompressed, 215 KB with gzip. Static frontend compression is cached in memory; ETag revalidation returns 304. Private files and range requests retain their existing handling.
- Dashboard content previews no longer load video streams. The three-day schedule uses Vietnam calendar dates, lists scheduled posts and pending calls with different colors, and opens the corresponding editor/conversation.
- Operational counters link to matching lists. Messages/comments count only conversations ending in a customer message within seven days, excluding resolved and hidden conversations. Pending content is deduplicated by content; posting failures consider the latest destination attempt within 48 hours. Tasks belong to the current employee; new orders are automatic drafts in the New state.

After changing a bundled frontend source, run `npm run build:app` and commit the generated bundle and manifest. The compiler uses the existing esbuild installation in `integrations/taophacdoT4/node_modules` (or a locally installed esbuild). `npm run check` verifies source hashes and the entry version to prevent deploying a stale bundle.

Validation: model boundary tests, authenticated compact/full snapshot and revision tests, static gzip/304/range checks, and `node scripts/test-dashboard-ui.mjs` for desktop/mobile layout, navigation into full chat history, and absence of video requests on the dashboard. External learner-source API calls are mocked in local UI tests.
