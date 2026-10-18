# Chat and Comments loading, 18 October 2026

Comments was requesting the full state snapshot (about 5.3 MB in the reported trace). It now shares the lightweight inbox metadata snapshot and loads only the selected conversation, initially 60 messages. Older messages remain accessible by pagination. The comment live endpoint checks inbox permission and channel access before returning data or conditional revisions; deleted threads remain inaccessible.

Both screens reuse in-memory conversation windows, and switching from another loaded screen paints available metadata before background validation. Individual live requests are isolated per user/conversation, so a slow request for the previous selection cannot block the next selection. Startup bootstrap and state GETs run concurrently. No browser persistent storage is used for message windows.

Comments initially renders 150 list entries, with an explicit Show more action; filtering still considers the complete authorized list and retains an off-page selection. Comment videos use preload=none and images lazy loading. Drafts, history pagination and scroll position are retained.

Validation: npm run check; all 602 Node tests passed; scripts/test-dashboard-ui.mjs passed with 170 comment threads, Chat history pagination, cold Comments startup, notifications, desktop/mobile dashboard, no automatic media requests, cached comment switch 131 ms and a new comment request 198 ms while the prior request was delayed 1.8 seconds. These are local fixture measurements, not promises about cold production network latency.

Production follow-up found an additional synchronous stall in refreshLearnerStatuses: it parsed every conversation once per linked learner after each remote status response. Pending purges are now projected to a Set with one SQLite query per refresh. The update still skips deleted customers and pending purges and writes facts only when the source status changes. New tests cover these protections and a batch of 300 learners with large conversation bodies (about 501 ms locally).
