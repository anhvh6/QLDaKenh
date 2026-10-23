# Frontend deployment on Vercel

The domain quanlydakenh.vercel.app proxies API and other requests to the existing VPS. On 2026-10-23 the Fold navigation fix (5518ea9) was deployed as three static overrides: public/style.css, public/app.bundle.js and public/workspace-design.css. All use Cache-Control: no-store. All other paths retain the previous rewrite to http://36.50.55.233/$1. No credentials, customer data or Android signing files are uploaded.

Production deployment was promoted from dpl_HK4q5wxgxQSdLy11CfCUvf6SCPZk. The previous proxy-only deployment is dpl_4Zs1i49qGZUCSCnjqxj6t1bHpioU (rollback reference).

Future frontend changes must update these Vercel overrides along with the VPS checkout: a VPS git pull alone does not replace files served by Vercel. Build with node scripts/build-app.mjs, then use an isolated temporary directory containing public/style.css, public/app.bundle.js, public/workspace-design.css and this vercel.json:

```json
{
  "rewrites": [{"source":"/(.*)","destination":"http://36.50.55.233/$1"}],
  "headers": [
    {"source":"/style.css","headers":[{"key":"Cache-Control","value":"no-store"}]},
    {"source":"/app.bundle.js","headers":[{"key":"Cache-Control","value":"no-store"}]},
    {"source":"/workspace-design.css","headers":[{"key":"Cache-Control","value":"no-store"}]}
  ]
}
```

Link the temporary directory to the existing project quanlydakenh, deploy a preview, verify all static files match the intended source and /api/health returns ok, then promote that deployment. Never deploy the workspace root: it contains private local files. The .env.local produced by Vercel link belongs only in the private temporary directory and must not enter Git.

The subsequent chat layout fix was promoted from dpl_AkQowQ94z66ozhkCRUywVhX9YpMq. Automatic GitHub linking has not been enabled; retain explicit deployment verification for each release.
