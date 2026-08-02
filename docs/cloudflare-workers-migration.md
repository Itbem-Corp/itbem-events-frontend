# Cloudflare Workers migration

Astro 6 no longer produces Cloudflare Pages Functions. The application now builds an immutable Worker entrypoint in `dist/server` and static assets in `dist/client`.

## Cost controls

- Static assets use the Workers assets binding and do not execute the Worker.
- CPU is capped at 10 ms per invocation in `wrangler.jsonc`.
- Logs and traces are sampled at 10 percent.
- Production promotion is manual and protected by the GitHub `production` environment.
- The workflow uploads and smoke-tests a preview version before it can receive production traffic.

Do not raise CPU, sampling, or traffic percentages without recording the estimated monthly impact and an alert threshold.

## One-time Cloudflare preparation

1. Confirm the account Workers plan and current Pages Functions request/CPU usage.
2. Set repository secrets `CLOUDFLARE_ACCOUNT_ID` and a narrowly scoped `CLOUDFLARE_API_TOKEN` that can edit only the `eventiapp-public` Worker.
3. Set repository variable `WORKER_PRODUCTION_URL` to the final HTTPS URL used for post-promotion smoke tests.
4. Protect the GitHub `production` environment with required reviewers and prevent self-review.
5. Enable Workers preview URLs and protect them with Cloudflare Access when possible.
6. Configure billing notifications before any domain receives Worker traffic.

## Candidate and cutover

1. Run **Deploy Cloudflare Worker** with `promote=false`.
2. Validate the preview URL, security headers, public event routes, RSVP and uploads.
3. Attach a temporary test domain and inspect Worker Analytics for request count, CPU and errors.
4. Run the workflow with `promote=true`; this deploys exactly the version tag that passed preview smoke tests.
5. Move the production custom domain only after the Worker deployment is healthy.
6. Keep the Pages project intact during the observation window.

## Rollback

The workflow calls `wrangler rollback --yes` if production smoke tests fail after promotion. If the custom-domain cutover itself fails, restore the prior Pages DNS/custom-domain route. Storage and bindings are not versioned with Worker rollbacks, so binding changes require their own rollback procedure.

## Acceptance criteria

- Static paths do not increment Worker invocation metrics.
- Dynamic SSR routes stay below 10 ms CPU at p99.
- No high or critical dependency finding exists.
- Candidate and production smoke tests pass.
- Error rate, CPU, request count and spend alerts are active.
- A Pages rollback remains possible until at least seven healthy production days have elapsed.
