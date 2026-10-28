# Automatic post comments

- Post composer (new/edit/duplicate) and bulk/new-video copy plans store `autoComment: {enabled,text,assetIds}`. Input and image controls stay hidden until enabled; maximum one image, stored separately from publication media.
- Frozen publication snapshots capture settings per channel. Plan settings apply when preparing/scheduling future publications; existing frozen publications retain their settings.
- Only confirmed API `published` records with external IDs are eligible. Demo/manual/pending/failed posts never send comments. Facebook, Threads, Bluesky and Mastodon support one image; Instagram, YouTube, X and Reddit are text only. Unsupported destinations are skipped independently after a mixed-platform warning; they do not prevent saving or publishing. Provider permissions remain required.
- Worker runs asynchronously after publishing ticks, records `sending` before any remote write, stores confirmed comment ID, and never repeats a sent/ambiguous request. HTTP 429 gets at most three attempts with delays; uncertain outcomes and interrupted sends require inspection on the original post. Comment errors leave the post published and create a separate notification/status in publication detail.
- No existing publications opt in automatically. No production comments/posts were sent during QA.
- QA: worker/platform request tests, existing copy automation/Threads regression tests, four viewport post/plan UI checks, fold navigation, syntax/bundle validation. Physical Android device behavior has not been tested; TWA receives served web changes on reload.
- Deploy frontend through main/Vercel; backend requires VPS update/restart. Health feature `autoPostComment` confirms backend rollout.

## Capability audit and library follow-up

- Shared client/server capability catalog now includes Bluesky image/text, Mastodon image/text, Reddit text. Existing Facebook/Threads image/text and Instagram/YouTube/X text remain supported. Bluesky uses grapheme counting (300), image size <=1 MB consistent with the existing upload connector, resolves the published AT URI to parent/root strong references, uploads one blob and embeds it in one reply. Mastodon preserves parent visibility and uses a stable Idempotency-Key.
- Tumblr public documented API has GET notes but no documented create-comment endpoint; Blogger/DEV.to/TikTok/Zalo connectors do not currently provide a compatible create-comment API. They remain explicitly unsupported instead of inventing successful operations. Single-platform forms hide unsupported features; mixed-platform forms show full controls and allow saving through an explicit capability warning.
- Add image opens the existing media library (image-only, post scope, one selection), with category/search/upload and preview. Original modal DOM is detached/restored so form values, handlers and unsaved plan dates/channels survive apply/cancel. Existing template picker defaults remain unchanged.
- Sources checked: https://github.com/tumblr/docs/blob/master/api.md , https://docs.bsky.app/docs/tutorials/creating-a-post , https://docs.joinmastodon.org/methods/statuses/ . No new production comment was sent by QA.
- Health `features.autoCommentCapabilities === 2` confirms the new backend.

## Mixed-platform saving

- No platform selected or one platform without comments: hide the automatic-comment section. One text-only platform: hide add/remove image and preview controls. Multiple distinct platforms: keep full controls.
- On Save, a dedicated warning dialog lists each unsupported action and offers Go back / Still save. Cancel preserves all inputs. No unsupported-capability exception blocks persistence.
- Keep original requested settings in content, plan and frozen publication; derive payload per destination only at dispatch. Unsupported platforms get skipped, text-only targets receive text without image, image size/text limits skip the affected part/destination without changing publication status or truncating text. Persist warning details for publication inspection.
- Health capability revision 3 identifies this backend. UI QA covers mixed FB/Instagram/Tumblr saves and warning cancel/confirm at all four viewport sizes; mocked worker tests assert correct per-channel payload and no call for unsupported providers.
