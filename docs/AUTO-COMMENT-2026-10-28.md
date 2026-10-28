# Automatic post comments

- Post composer (new/edit/duplicate) and bulk/new-video copy plans store `autoComment: {enabled,text,assetIds}`. Input and image controls stay hidden until enabled; maximum one image, stored separately from publication media.
- Frozen publication snapshots capture settings per channel. Plan settings apply when preparing/scheduling future publications; existing frozen publications retain their settings.
- Only confirmed API `published` records with external IDs are eligible. Demo/manual/pending/failed posts never send comments. Facebook and Threads support one image; Instagram, YouTube, X and Mastodon are text only. Other providers reject enabled configuration before saving. Provider permissions remain required.
- Worker runs asynchronously after publishing ticks, records `sending` before any remote write, stores confirmed comment ID, and never repeats a sent/ambiguous request. HTTP 429 gets at most three attempts with delays; uncertain outcomes and interrupted sends require inspection on the original post. Comment errors leave the post published and create a separate notification/status in publication detail.
- No existing publications opt in automatically. No production comments/posts were sent during QA.
- QA: worker/platform request tests, existing copy automation/Threads regression tests, four viewport post/plan UI checks, fold navigation, syntax/bundle validation. Physical Android device behavior has not been tested; TWA receives served web changes on reload.
- Deploy frontend through main/Vercel; backend requires VPS update/restart. Health feature `autoPostComment` confirms backend rollout.
