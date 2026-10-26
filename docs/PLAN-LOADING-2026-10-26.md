# QL Phác đồ loading

The outer shell used `state?view=workspace`, which sent unrelated CRM data before the embedded management page could mount. The embedded page also waited for both learners and products, and several catalog consumers issued duplicate requests.

- `view=phacdo` now returns only the shell and authorized plan handoff navigation. Restricted channel scope is preserved. Learner details still use the existing authenticated management queries.
- Products load independently from learners. Concurrent catalog readers share a request and retain the result in memory for at most 15 seconds. Existing periodic refresh continues.
- The existing `super_admin` UI path no longer loads unused role mappings; backend authorization is unchanged.
- Repeated Supabase GETs for customers, pending devices and role mappings use a user/role/query-scoped memory cache for 15 seconds. Successful responses only, maximum 64 entries/24 MiB, no disk/browser persistence added. Proxy mutations invalidate entries before and after the write; older in-flight reads cannot repopulate the cache. Independent source writes may take up to 15 seconds to appear.

Validation: `node --test tests/read-burst-cache.test.mjs tests/page-snapshots.test.mjs`, `npm run check`, `node scripts/test-plan-loading.mjs`, `node scripts/test-fold-navigation.mjs`.

Local isolated fixture (1,000 historical customers and posts): workspace 2,058,335 bytes/54 ms; plan shell 5,385 bytes/6 ms. Browser fixtures with a deliberately delayed 2.5-second product response rendered the learner in 480–1,016 ms across 390/840/1100/1440 px. These are local QA measurements, not production WAN timings or physical Samsung tests.

Deployment requires both Vercel frontend and VPS backend. Android TWA receives the same frontend on reload; no native APK change. Check `/api/health` feature `planLoadingCompact`, served bundle metadata, and the plan-ui asset referenced by its HTML before claiming the rollout is complete.
