# Cross-page latency investigation

Public production probes found occasional 3–4 second delays even on direct VPS `/api/health`, while the handler's own measured processing time was below 1 ms. This indicates queuing outside the handler and is consistent with synchronous background work blocking Node's event loop; it does not by itself exclude host scheduling or network issues.

A reproducible hot path was Zalo profile-name hydration. Each batch contains up to 50 profiles. The previous implementation parsed every conversation and every message for each profile inside one synchronous transaction. At the observed collection sizes this repeatedly parses hundreds of megabytes of unrelated history.

The replacement reads matching conversations once and seeks matching incoming senders using a partial SQLite index. Each profile is updated atomically, manual customer names remain protected, and every 10 profiles yields to the event loop. Sender names never cross channel boundaries. This does not send any external messages or change polling/receipt semantics.

An isolated fixture with 4,100 conversations, 37,000 historical messages and 200 staff handoffs measured the legacy profile scan alone at 4,027 ms versus 253 ms for the indexed version including writes. These are local fixture measurements, not proof of production latency after deployment.

Additional changes reuse immutable learner indexes for the same source revision (invalidated on source/permission writes and transactions), index the chatbot's recent inbound scan, load a compact connection-settings snapshot, and coalesce Drive config reads. Background Drive config refresh is limited to 30 seconds while visible; explicit saves refresh immediately and ignore older in-flight responses.

System metrics now include `lagMax` to expose stalls hidden by average event-loop lag. Backend health feature `serverLoadRecovery` identifies this release. Frontend and VPS deployment must both be verified before reporting full completion. Android TWA uses the same origin; physical-device testing is still separate.
