# Instagram text, image groups and incoming sync

The configured connector uses Facebook Login, a linked Page and a Page token. Chat history now uses the linked Page with `platform=instagram` and can read the verified Instagram identity when the Page edge returns an empty list or a documented unsupported-object error. Both owned identities are excluded from the peer list and used to classify outgoing echoes. Webhook object type prevents Facebook/Instagram cross-routing for a shared Page. Sender echo metadata is retained during ingest.

History replay repairs missing `lastInboundAt` even when the message already exists, so a known customer reply can unlock a private reply conversation without creating a duplicate message. Thread IDs are saved to avoid repeating conversation lookup. Active chat polling remains independent from history import. History reads have eight-second deadlines, three bounded workers per channel and Instagram polling eligibility every five seconds; other channels keep their own cadence. A slow/erroring thread does not block reading the remaining threads. Permission failures remain visible in channel sync diagnostics.

Multiple JPG/PNG images (2–10) are sent as one Instagram generic-template carousel with one provider receipt, not separate image requests. Text, when present, is preserved as a separate text message preceding the single image group. One image retains the normal image attachment format. Every file is validated before the first send; only eight header bytes are read for file signature checks. A carousel rejection or partial send is not silently retried as separate images. Unknown/partial results retain provider receipts for reconciliation. Incoming multi-image attachments stay in one local message. Manual Instagram sync and its status are available alongside Messenger.

Primary reference: Meta's Instagram API collection, Generic Template:
https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-af579d08-121e-4897-8f45-5fd41ace49df

These changes cannot grant Meta permissions or change external conversation routing. Live receipt still depends on the app's Instagram messaging permissions, webhook subscriptions and access to the linked account. No real customer messages are sent by the QA suite. Production UI inspection is unavailable because the browser approval gate reported exhausted workspace credits. A live incoming/outgoing customer exchange is not claimed as verified.

Release requires VPS backend update; `/api/health` exposes `instagramChatRecovery: true`. The channel status wording uses the web origin shared by Android TWA and requires Vercel asset deployment. No native APK update is needed.
