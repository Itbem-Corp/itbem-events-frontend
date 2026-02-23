/**
 * Post-build script: fixes _routes.json for Cloudflare Pages.
 *
 * Astro's Cloudflare adapter auto-generates exclude rules based on static
 * assets in the output directory. This incorrectly excludes SSR routes like
 * /e/* and /events/* from the worker, causing 404s for dynamic pages.
 *
 * This script removes conflicting exclude entries and ensures SSR routes
 * are in the include list so Cloudflare invokes the worker for them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTES_PATH = resolve('dist', '_routes.json');

// SSR routes that MUST go through the Cloudflare worker
const SSR_ROUTES = ['/e/*', '/rsvp/*', '/evento', '/events/*/upload'];

// Patterns to remove from exclude (they conflict with SSR routes)
const EXCLUDE_REMOVE = ['/e/*', '/events/*'];

const routes = JSON.parse(readFileSync(ROUTES_PATH, 'utf-8'));

// Remove conflicting excludes
routes.exclude = routes.exclude.filter(
  (pattern) => !EXCLUDE_REMOVE.includes(pattern)
);

// Ensure SSR routes are in include
for (const route of SSR_ROUTES) {
  if (!routes.include.includes(route)) {
    routes.include.push(route);
  }
}

writeFileSync(ROUTES_PATH, JSON.stringify(routes, null, 2) + '\n', 'utf-8');

console.log('_routes.json fixed:');
console.log('  include:', routes.include);
console.log('  exclude:', routes.exclude);
