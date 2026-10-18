# Chat initial load and history windows

The inbox previously fetched the full workspace message history in `/api/state?view=full`, then fetched every message in the selected conversation again through `/live`. Media elements also requested video/audio metadata immediately. Large conversations caused duplicate transfers and expensive DOM creation.

`view=inbox` now returns workspace/conversation metadata without message history. The selected conversation loads its latest 60 messages using the existing indexed live endpoint. Older pages use a timestamp/ID cursor, including deterministic handling of equal timestamps. Three conversation windows are cached in the current account/session; inaccessible conversations and previous-account data are discarded. Workspace refreshes preserve loaded windows and unchanged message DOM nodes.

Quoted context and pinned-message metadata remain available outside the current window. Loading older history preserves scroll position. Explicit search, the media/file dialog, and jumping to an older message may request complete history for that conversation only; concurrent complete-history requests are deduplicated. Notification links still open/highlight the target, including older targets. Audio/video use `preload=none` and load on playback.

Validation includes cursor boundaries, quote isolation, compact/full snapshot separation, UI pagination from 60 to 120 to all 151 fixture messages, notification cold/warm navigation, and no automatic video requests. No customer message or carrier order is sent during testing.

Read-only production measurement: the largest stored conversation had 878 messages (815,663 bytes); its first 60-message window was 59,762 bytes and took 3 ms to query. This compares message data only, not complete page/network timing.
