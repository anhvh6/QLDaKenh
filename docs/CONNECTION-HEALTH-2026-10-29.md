# Connection status and Google authorization

Live verification reproduced HTTP 400 when checking the YouTube API. Opening a
fresh reconnect flow after the user signed into YouTube exposed Google's exact
authorization error: YouTube scopes and a previously granted `drive.file` scope
could not be requested together. This proves the reconnect-flow failure; the
previous publishing errors still need the Google diagnostic probe to confirm
their token error codes.

Google authorization now explicitly uses `include_granted_scopes=false` for
YouTube/Blogger, keeping each channel's scopes separate from Drive grants. Client
bindings and OAuth state validation remain unchanged. No grant is revoked.

Connection checks persist success/failure, last success, provider code and time.
Authentication, permission, rate-limit, transport and unclassified errors have
different labels and next steps. Network/HTML errors do not mark a channel as
disconnected. An old `connected` record without a recent successful check is
shown as needing a check, not as a healthy API. Successful profile checks are
valid for the displayed status for 24 hours; that is a display freshness rule,
not proof that all write permissions work.

Publishing outcomes are tracked separately so an invalid video is not reported
as lost authentication. Check failures invalidate state and collection caches,
including on API error responses. OAuth reconnection clears stale profile health
errors. The page does not fan out provider API requests on each load.

Validation: 25 focused tests, npm run check, connection-health UI on 390/840/1100/
1440 px and scripts/test-fold-navigation.mjs passed with local synthetic data.
No physical Samsung Fold test. No publication was retried again after the live
Google authorization error. Backend rollout and a completed OAuth consent flow
are still required before a successful YouTube publish can be claimed.

Reference: https://developers.google.com/youtube/reporting/guides/authorization/server-side-web-apps
