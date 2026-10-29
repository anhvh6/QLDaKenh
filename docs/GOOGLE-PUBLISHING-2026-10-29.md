# Google publishing diagnostics, 29 October 2026

The screenshot shows Blogger and YouTube failures reported as HTTP 400. It does
not identify the failed endpoint or prove that a refresh token expired.

The shared remote helper previously ignored OAuth `error_description` and string
`error`, producing a generic HTTP 400. It now distinguishes invalid grants,
OAuth client problems, quota and YouTube validation reasons, while preserving
unknown provider messages. Explicit OAuth rejection stops before creating a post.
Existing ambiguous-write protection remains unchanged: never automatically
resubmit a publication whose outcome is unknown.

Run `node scripts/diagnose-google-publishing.mjs` on the VPS to inspect failed
publication IDs, stored error stages, same-content published records, token
refresh and read-only channel identity. It does not publish, upload, modify the
local database or print tokens/content. Its refresh probe requests a short-lived
access token without storing it.

Before retrying, compare repeated failures by channel/content and check published
records, especially where external IDs exist. Retry the intended original task
once; do not create a duplicate task to troubleshoot authentication.

If the probe confirms `invalid_grant`, reconnect the affected channel to the same
Google OAuth application. Check Google Auth Platform publishing status: external
applications in Testing with these scopes receive seven-day refresh tokens.
Production status removes that specific testing expiry, but tokens can still be
revoked; it is not a guarantee of permanent authorization.

References:
- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/youtube/v3/docs/videos/insert

Validation: 18 focused tests passed, including a simulated invalid grant with zero
publication calls, existing ambiguous publication protection and client bindings;
`npm run check` passed. Actual failed publications have not yet been retried:
the live browser requires login and automated SSH authentication is unavailable.
