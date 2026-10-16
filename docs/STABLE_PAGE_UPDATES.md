# Background updates and direct profit entry

`refreshBackground()` still requests conditional snapshots and receives SSE change events. It adopts new state and updates notification badges, but compares the data used by the visible page before repainting Dashboard or Content. An unchanged snapshot, notification change, asset usage counter, or channel sync timestamp does not replace media cards. A changed title, publication state, relevant channel state, or dashboard conversation preview does repaint. User actions and navigation keep their explicit render behavior.

Copy automation compares its returned state before repainting its own region. Learner summary buttons are also only replaced when their HTML changes. System charts continue to update in their own region as new samples arrive.

The imported management bundle excluded `analytics` from its customer/product loading guard. `scripts/patch-plan-analytics.mjs` applies the reviewed one-token-list change and bumps its entry URL. Reapply it after importing a new management build; it fails if the expected loading guard changes. The source equivalent is to include `analytics` in `needsAllCustomers` in the management App component.

Validation: `node --test tests/page-data-key.test.mjs` and `node scripts/test-stable-pages-ui.mjs`. The UI test preserves media element identity across unchanged and unrelated snapshots, verifies changed content renders, then opens Profit into the real compiled management application with mocked source API rows and verifies a nonzero learner count and calculated profit. No live customer or financial records are written.
