# Publishing failure fixes — 2026-10-23

- YouTube resumable initialization used an undefined `options` variable. The upload now initializes with its own timeout. A missing final receipt, interrupted receipt body or upload server error remains `unknown`; no automatic upload retry is performed.
- A slow upload held the serial scheduler while later jobs crossed the one-minute deadline. Each five-second timer pulse now admits eligible scheduled jobs before checking the busy flag. Admission is process-local, tied to the publication ID and exact scheduled time, and invalidated when cancelled, rescheduled or no longer eligible. Dispatch still rechecks plan activity, permissions and source duplication. Jobs first observed after the deadline, including after downtime, still require rescheduling. Queue admission does not guarantee publication at the exact scheduled second.
- Copy preparation now links the draft before preflight. Validation errors can be opened in the existing content editor, and common/per-channel edits survive preparation retries. Startup restores a legacy orphaned draft only when there is exactly one matching draft. Length limits remain blocking; content is never silently truncated.
- Confirmed receipts for every destination can clear a stale failed/unknown copy-item flag. Partial or uncertain results stay unresolved. Dashboard totals omit the duplicate copy-item row when its content publications already represent it.

Backend deployment is required. The aggregate database is SQLite and needs no Supabase SQL change. Production failed publications are not automatically replayed by this patch. Reconcile and reschedule only unsent destinations; preserve successful receipts.

Regression coverage: mocked resumable upload, broken receipts, a long upload with six waiting jobs across multiple batches, actual missed schedules, cancellation/rescheduling, editable failed preflight, draft recovery, partial receipts, and dashboard deduplication. Tests do not publish to real accounts.


## Cached alternate for a future unsent slot

Copy plans now revalidate queued media/text during the five minutes before the slot. Validation uses the actual per-destination queued caption, including edits, rather than stale source text. Missing/inactive local video or a hard preflight error blocks the unsent publications before dispatch. Preparation failures also qualify for alternate selection while the original slot is still in the future.

The worker searches unused items in the same source and plan, ordered by the configured oldest/newest/stable-random priority. It can advance an untouched later reservation; it never steals a prepared/in-flight item. A candidate must already have a completed Google Drive job in the authorized storage scope, an existing local video file, and pass destination preflight. The existing Drive folder/assets are reused without a new download job. Selection is retried at most once a minute while no suitable candidate exists.

Successful, scheduled, processing, manually awaiting confirmation or unknown source results on ANY account of the target platform exclude a candidate. A second platform-wide source-history check runs at dispatch. Plans that require sending the same alternate to multiple accounts on the same platform are not automatically replaced. The alternate keeps the slot, links back to the failed item, and records an audit event; the result list exposes “Xem bài bù”. The original error remains visible.

No alternate is dispatched for a past slot or in response to an attempted/uncertain provider write. Existing historic failures still require reconciliation and an explicit new schedule. This prevents a fix deployment from unexpectedly publishing a backlog. Provider outages, permissions, quotas, and content review may still require user action.
