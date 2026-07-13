import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const workerEntry = resolve('dist', '_worker.js');

if (!existsSync(workerEntry)) {
  throw new Error('Cloudflare build not found. Run `npm run build` before starting the preview.');
}

const host = process.env.HOST?.trim() || '127.0.0.1';
const port = process.env.PORT?.trim() || '4321';
const numericPort = Number(port);

if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65_535) {
  throw new Error(`Invalid PORT: ${port}`);
}

// Wrangler 4.110+ deliberately exports package.json but no longer exports its
// bin subpath. Resolve the public package boundary, then locate the declared
// CLI inside that package without depending on the removed subpath export.
const wranglerPackageRoot = dirname(require.resolve('wrangler/package.json'));
const wranglerCli = resolve(wranglerPackageRoot, 'bin', 'wrangler.js');
const result = spawnSync(
  process.execPath,
  [
    wranglerCli,
    'pages',
    'dev',
    resolve('dist'),
    '--ip',
    host,
    '--port',
    String(numericPort),
    // Match the compatibility date supported by the pinned Wrangler/workerd.
    // Additional CLI arguments are appended so callers can override it explicitly.
    '--compatibility-date',
    '2025-11-18',
    ...process.argv.slice(2),
  ],
  { env: process.env, stdio: 'inherit' },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
