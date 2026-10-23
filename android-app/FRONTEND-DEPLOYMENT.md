# Frontend deployment on Vercel

## Automatic deployment

User explicitly approved automatic production deployment of every main commit on 2026-10-23. Existing Vercel project quanlydakenh (prj_6sTsynpiJeJRbi5GBLtrWjfWAGJC) is connected to GitHub anhvh6/QLDaKenh, production branch main, Node.js 24.x.

Root vercel.json is the source of deployment configuration:

- npm ci installs locked dependencies.
- npm run build:app && npm run check rebuilds the browser bundle and validates source/bundle consistency.
- Only public is published. Local signing files, credentials and customer data must never enter Git or the public directory.
- Static files are served by Vercel. Remaining requests, including /api and stored media, retain the existing proxy to http://36.50.55.233/$1.
- HTML/CSS/JS are revalidated so the Android TWA and website use the same frontend release. This is not a service-worker cache: sw.js does not cache private APIs/media.

After pushing main, inspect the Git-triggered production deployment, ensure it reaches Ready, compare the deployed commit and public/app.bundle.meta.json version, verify served files and /api/health, then test affected flows in browser/app. A push accepted by GitHub is not evidence the build succeeded.

The Android app opens https://quanlydakenh.vercel.app/ and therefore receives web changes from that deployment on reload. Native Android changes still require an incremented versionCode, the original signing key, a new APK, and device/emulator QA.

Vercel deploys the frontend only; Node workers, scheduled jobs, database and provider tokens remain on the VPS. The separate .github/workflows/deploy.yml is responsible for VPS updates and needs working VPS secrets. Do not claim a backend rollout succeeded just because the Vercel build succeeded.

## Previous releases and rollback references

Before Git integration, only style.css, app.bundle.js and workspace-design.css were published as static overrides. Those temporary directories are no longer the normal deployment source.

- Original proxy-only deployment: dpl_4Zs1i49qGZUCSCnjqxj6t1bHpioU.
- Fold navigation preview: dpl_HK4q5wxgxQSdLy11CfCUvf6SCPZk.
- Fold chat layout preview: dpl_AkQowQ94z66ozhkCRUywVhX9YpMq.

Rollback by promoting a known-good deployment, then correct/revert main so the next commit does not restore the faulty release. Keep secrets and production customer screenshots out of Git.
