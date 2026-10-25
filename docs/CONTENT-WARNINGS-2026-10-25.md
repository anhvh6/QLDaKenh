# Draft warnings and automatic replacement

Draft cards evaluate current destination text without waiting for a publication record or an editor visit. The warning badge and Warning status filter use the same character rules and shared content review signals as publication preflight. Only drafts with a concrete current text warning qualify; scheduled, publishing, published and failed records do not. Historical reviews, generic errors, missing thumbnails and unfinished media preparation cannot create this status. Each qualifying card displays its first warning reason and destination. Filtering a platform only includes that platform's warnings. Editing the draft to resolve the issue removes its warning without retaining stale review messages.

Automatic copy plans stop on both validation errors and review warnings before media preparation, before scheduling, during the final five-minute review and at dispatch. The existing replacement mechanism selects only an eligible, downloaded Drive video that passes all destination checks, preserves the slot, checks duplicate/reserved sources and retains the original draft and error. It does not replace attempted or ambiguous writes. Without a usable alternative, the plan records that no reviewed Drive fallback is available and keeps the original for editing. Manual acknowledged posting remains available.

No additional database table is needed: draft warnings are read-only derivations of current text and channels; existing plan items, events and publication records store fallback and dispatch outcomes.

Validation: 95 targeted unit/integration tests; composer/card/filter UI at 390, 840, 1100 and 1440 pixels; fold-navigation regression at phone, unfolded touch, landscape touch and desktop mouse. Browser tests use isolated QA data and do not publish externally. These checks do not constitute physical Samsung Fold 7 testing.

Deployment requires both Vercel static assets and the VPS backend. `/api/health` exposes `draftWarningReview: true` after the backend update. The Android TWA consumes the same frontend origin; no native APK change is required.
