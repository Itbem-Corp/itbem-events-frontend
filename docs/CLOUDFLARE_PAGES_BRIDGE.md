# Cloudflare Pages bridge

`www.eventiapp.com.mx` is still delegated through the external Route 53 DNS
zone and therefore cannot be attached directly to the `eventiapp-public`
Worker. Cloudflare requires a Worker custom domain to belong to an active zone
in the same Cloudflare account.

The existing `itbem-events-frontend` Pages project is an atomic, reversible
bridge: its advanced-mode `_worker.js` forwards requests to the production
Worker, preserves paths, query strings and request bodies, and rewrites HTML
and same-origin redirects back to the hostname used by the visitor.

The deployable source is `cloudflare-pages-bridge/_worker.js`. Zip that file so
it is at the archive root, upload it first as a Pages preview, and run:

```bash
bash scripts/smoke-security-headers.sh https://<preview>.itbem-events-frontend.pages.dev
PUBLIC_DASHBOARD_URL=https://dashboard.eventiapp.com.mx \
  bash scripts/smoke-root.sh https://<preview>.itbem-events-frontend.pages.dev
```

Only upload the same archive to the Pages production environment after both
checks pass. The previous Pages deployment remains the rollback target.

Remove this bridge after the complete `eventiapp.com.mx` DNS zone has been
copied, verified and delegated to Cloudflare, and `www.eventiapp.com.mx` has
been attached directly to the Worker. Do not migrate the zone from an
incomplete public-DNS inventory because API, dashboard and mail records share
the same zone.
