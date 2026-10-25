# Instagram text, image groups and incoming sync

The configured connector uses Facebook Login, a linked Page and a Page token. Chat history now uses the linked Page with `platform=instagram` and can read the verified Instagram identity when the Page edge returns an empty list or a documented unsupported-object error. Both owned identities are excluded from the peer list and used to classify outgoing echoes. Webhook object type prevents Facebook/Instagram cross-routing for a shared Page. Sender echo metadata is retained during ingest.

History replay repairs missing `lastInboundAt` even when the message already exists, so a known customer reply can unlock a private reply conversation without creating a duplicate message. Thread IDs are saved to avoid repeating conversation lookup. Active chat polling remains independent from history import. History reads have eight-second deadlines, three bounded workers per channel and Instagram polling eligibility every five seconds; other channels keep their own cadence. A slow/erroring thread does not block reading the remaining threads. Permission failures remain visible in channel sync diagnostics.

Multiple JPG/PNG images (2–10) are sent as one Instagram generic-template carousel with one provider receipt, not separate image requests. Text, when present, is preserved as a separate text message preceding the single image group. One image retains the normal image attachment format. Every file is validated before the first send; only eight header bytes are read for file signature checks. A carousel rejection or partial send is not silently retried as separate images. Unknown/partial results retain provider receipts for reconciliation. Incoming multi-image attachments stay in one local message. Manual Instagram sync and its status are available alongside Messenger.

Primary reference: Meta's Instagram API collection, Generic Template:
https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-af579d08-121e-4897-8f45-5fd41ace49df

These changes cannot grant Meta permissions or change external conversation routing. Live receipt still depends on the app's Instagram messaging permissions, webhook subscriptions and access to the linked account. No real customer messages are sent by the QA suite. Production UI inspection is unavailable because the browser approval gate reported exhausted workspace credits. A live incoming/outgoing customer exchange is not claimed as verified.

Release requires VPS backend update; `/api/health` exposes `instagramChatRecovery: true`. The channel status wording uses the web origin shared by Android TWA and requires Vercel asset deployment. No native APK update is needed.
# Follow-up: incomplete conversation responses and mobile focus

Conversation responses without `participants` are no longer discarded: sender
and recipient fields in individual messages determine identity. ID-only message
rows are hydrated via their message-ID endpoint, with up to three concurrent
reads and an eight-second timeout per read. Missing sender/content is reported
as an error rather than importing a fabricated message or reporting success.
Instagram always checks the latest message page even when the conversation's
`updated_time` is unchanged. Empty results show an attention state and successful
reads display their message count. This does not prove live customer delivery.

On touch layouts, focus in the composer and keyboard viewport resizing scroll
the active chat/comment feed to its end. Ordinary viewport scroll and typing do
not repeatedly force scrolling; existing mobile send-focus retention is kept.
Validated with long local conversations at 390/840/1100 touch and desktop mouse.
