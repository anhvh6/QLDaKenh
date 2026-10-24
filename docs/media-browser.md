# Shared media browser

Library and chat/comment attachments share borderless folder rows, compact filenames,
and sort choices. The phone picker has three columns of square covers;
folder names scroll horizontally. Desktop has a folder rail beside the grid.
Existing folders, favorites, metadata editing, scope/channel checks and uploads
remain available. Video covers never load the MP4 before an explicit play action.

`Dùng gần đây` is the default folder in the Library and attachment picker: select the 20 most recently used active
images/videos, then apply the chosen display order. Only accepted/sent/delivered/
read outgoing messages and successful publications count; previews, drafts,
failed sends and demo sends do not. Repeated attachments in one event count once.
New uploads come first by default. Alternative sorts are oldest upload, name,
recent use and most used. Sort choice is remembered per user on the device.

`GET /api/media/usage` returns counts/timestamps for authorized assets only.
`server/media-usage-store.mjs` reads attachment/publication metadata in SQL and
caches by record-kind revision. It does not parse complete message histories or
create another table. No Supabase SQL/migration is required. Compact chat and
comment snapshots fetch these statistics only when the media picker is opened.

Validation: `tests/media-browser.test.mjs`, `tests/media.test.mjs`,
`scripts/test-media-browser-ui.mjs`, `scripts/test-media-ui.mjs` and
`scripts/test-fold-navigation.mjs`. Browser QA uses isolated synthetic fixtures;
it is not physical Samsung Fold testing.

Deploy frontend and VPS backend. `/api/health` must report
`features.mediaUsageMetadata: true` to confirm the statistics endpoint is live.
Android TWA uses the same frontend origin and needs no new APK for this change.

Search and date filters are omitted from this browser. Hold a tile for 600 ms
to open an unframed media preview; its close and selection controls are icons.
Escape closes only the preview and restores focus. Videos use preload=none
and never autoplay. Library edit/favorite/use/download actions are borderless
icons with accessible labels. This styling update is frontend-only.

The Library route uses `GET /api/state?view=media`, a media-only snapshot
with channel-scoped assets, categories, favorites and cached usage. It omits
contents, customers, messages, plans and publication histories. Destination
choices are fetched only when the user selects the use action. This requires
`features.mediaCompact` on the VPS. No database migration is required.

Library image covers use authenticated, bounded thumbnails; small images are
served directly. Generating a missing preview waits at most 200 ms before
serving the original image or video placeholder. Cached previews revalidate
with private ETags; permission checks run before any 304. Video bytes still
require explicit playback. `scripts/test-media-compact.mjs` measures payload
size with synthetic data and verifies route selection, image display and 304
access control. Production latency must be measured after the VPS update.
