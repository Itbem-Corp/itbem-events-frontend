/**
 * Post-build script: fixes _routes.json for Cloudflare Pages.
 *
 * Astro's Cloudflare adapter auto-generates exclude rules based on static
 * assets in the output directory. This script removes any exclude entries
 * that would conflict with SSR routes, ensuring the worker handles them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTES_PATH = resolve('dist', '_routes.json');

// Patterns to remove from exclude (they would block SSR routes from reaching the worker)
const EXCLUDE_REMOVE = ['/e/*', '/events/*'];

const routes = JSON.parse(readFileSync(ROUTES_PATH, 'utf-8'));

// Remove conflicting excludes
const before = routes.exclude.length;
routes.exclude = routes.exclude.filter(
  (pattern) => !EXCLUDE_REMOVE.includes(pattern)
);

writeFileSync(ROUTES_PATH, JSON.stringify(routes, null, 2) + '\n', 'utf-8');

console.log('_routes.json fixed:');
console.log('  include:', routes.include);
console.log('  exclude:', routes.exclude);
if (before !== routes.exclude.length) {
  console.log(`  removed ${before - routes.exclude.length} conflicting exclude(s)`);
} else {
  console.log('  no conflicting excludes found');
}
