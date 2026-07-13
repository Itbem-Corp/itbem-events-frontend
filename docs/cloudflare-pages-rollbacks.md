# Cloudflare Pages production rollback

The production workflow uses Cloudflare's supported Pages rollback API. It does
not infer the previous release from list ordering:

- `GET /accounts/{account_id}/pages/projects/{project_name}` exposes
  `result.canonical_deployment`, the deployment serving production when the
  rollout starts.
- `POST /accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id}/rollback`
  restores a successful production deployment.
- The API token must have `Pages Write`. It is passed only through the
  `Authorization` header and the release helper redacts it from errors.

Official references:

- <https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get/>
- <https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/rollback/>
- <https://developers.cloudflare.com/pages/configuration/rollbacks/>

## Rollout contract

`.github/workflows/deploy-frontend.yml` performs these transitions under a
non-canceling production concurrency lock:

1. Capture and validate the current `canonical_deployment` as a successful
   production deployment. Missing or ambiguous state stops the rollout before
   production changes.
2. Upload `dist/` to the `deployment-candidate` preview branch and smoke its
   immutable deployment URL.
3. Verify the deterministic SHA-256 fingerprint of `dist/`, then upload that
   same downloaded artifact, without rebuilding, to the production branch.
   Cloudflare does not allow a preview deployment to be a rollback target, so
   Pages has no supported preview-to-production promotion primitive for this
   flow.
4. Verify through the API that the new deployment is production, successful,
   and belongs to the exact Git commit. Then smoke both its immutable URL and
   `https://www.eventiapp.com.mx`.
5. If the production upload fails after it starts, API verification fails, or
   either production smoke fails, request rollback to the captured deployment
   and poll `canonical_deployment` until the restoration is verified.
6. Keep the workflow failed even after a successful rollback so the degraded
   release remains visible and alertable.

The rollback helper sends at most one mutating request. If the POST response is
lost, it resolves the ambiguity by reading `canonical_deployment`; it does not
blindly repeat the mutation. If the previous deployment is already canonical,
the helper treats the rollback as an idempotent no-op.

## Local validation (no Cloudflare mutations)

```bash
actionlint .github/workflows/deploy-frontend.yml
npm run test:unit -- tests/unit/cloudflarePagesRelease.test.ts
node --check scripts/cloudflare-pages-release.mjs
git diff --check
```

Do not run `rollback` locally as a validation command. The unit tests inject a
fake HTTP transport and cover successful restoration, no-op restoration,
ambiguous POST responses, fail-closed verification, exact-commit checks, and
token redaction without contacting Cloudflare.
