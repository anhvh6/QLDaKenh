# Permission headers, empty roles and notification delivery

Role names and actions share one flex row. Delete is offered only when there are no non-deleted accounts assigned to the role, including locked accounts; the server rechecks this under the same transaction/version guard as other permission changes. The owner role remains protected. Filtering the matrix cannot make an occupied role appear deletable.

Permission headers open a name editor with a delete action. Renaming changes the label only. Deleting removes the column and all explicit role/user values, and persists a capability tombstone: effective access for that capability becomes true for all accounts. Tombstones are included in the embedded plan permission payload so the plan UI and server agree. Deleted notification columns are not re-added during migration. These edits are audited and reject stale matrix versions.

A separate notification matrix contains published, failed/blocked/unknown publication, planned draft, new comment, new chat, automatic outgoing message and AI outgoing message categories. Existing roles retain their notification delivery by default when the seven columns are introduced. Personal overrides apply as in the functional matrix; even the owner may disable/re-enable their own notifications without changing protected functional rights.

The shared notification filter is used for the in-app list, badge and web push. Delivery still respects conversation/channel scope, recipient restrictions and device preferences. Publication state transitions, queued reup items and successfully accepted/sent automatic/AI messages create stable deduplicated notification records. Failed sends and historical imports do not generate new outgoing alerts. Existing failure notice calls are replaced by the state transition notification to avoid duplicates.

Notification read receipts are now per user (`notification_reads` in the existing records store); one user's acknowledgement does not consume another user's notice. Read receipts invalidate state caches and suppress that user's push delivery. No production messages, posts or test push notifications are sent during validation.
