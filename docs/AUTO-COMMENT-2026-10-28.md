# Automatic post comments

- Post composer (new/edit/duplicate) and bulk/new-video copy plans store `autoComment: {enabled,text,assetIds}`. Input and image controls stay hidden until enabled; maximum one image, stored separately from publication media.
- Frozen publication snapshots capture settings per channel. Plan settings apply when preparing/scheduling future publications; existing frozen publications retain their settings.
- Only confirmed API `published` records with external IDs are eligible. Demo/manual/pending/failed posts never send comments. Facebook, Threads, Bluesky and Mastodon support one image; Instagram, YouTube, X and Reddit are text only. Other providers reject enabled configuration before saving. Provider permissions remain required.
- Worker runs asynchronously after publishing ticks, records `sending` before any remote write, stores confirmed comment ID, and never repeats a sent/ambiguous request. HTTP 429 gets at most three attempts with delays; uncertain outcomes and interrupted sends require inspection on the original post. Comment errors leave the post published and create a separate notification/status in publication detail.
- No existing publications opt in automatically. No production comments/posts were sent during QA.
- QA: worker/platform request tests, existing copy automation/Threads regression tests, four viewport post/plan UI checks, fold navigation, syntax/bundle validation. Physical Android device behavior has not been tested; TWA receives served web changes on reload.
- Deploy frontend through main/Vercel; backend requires VPS update/restart. Health feature `autoPostComment` confirms backend rollout.

## Capability audit and library follow-up

- Shared client/server capability catalog now includes Bluesky image/text, Mastodon image/text, Reddit text. Existing Facebook/Threads image/text and Instagram/YouTube/X text remain supported. Bluesky uses grapheme counting (300), image size <=1 MB consistent with the existing upload connector, resolves the published AT URI to parent/root strong references, uploads one blob and embeds it in one reply. Mastodon preserves parent visibility and uses a stable Idempotency-Key.
- Tumblr public documented API has GET notes but no documented create-comment endpoint; Blogger/DEV.to/TikTok/Zalo connectors do not currently provide a compatible create-comment API. They remain explicitly unsupported instead of inventing successful operations. UI displays channel-specific capability before saving and disables enabling a new all-unsupported selection.
- Add image opens the existing media library (image-only, post scope, one selection), with category/search/upload and preview. Original modal DOM is detached/restored so form values, handlers and unsaved plan dates/channels survive apply/cancel. Existing template picker defaults remain unchanged.
- Sources checked: https://github.com/tumblr/docs/blob/master/api.md , https://docs.bsky.app/docs/tutorials/creating-a-post , https://docs.joinmastodon.org/methods/statuses/ . No new production comment was sent by QA.
- Health `features.autoCommentCapabilities === 2` confirms the new backend.
