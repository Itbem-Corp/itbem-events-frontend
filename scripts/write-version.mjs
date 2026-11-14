/**
 * Post-build script: writes dist/client/version.json, the commit this build was made from, as a static Worker asset.
 *
 * Torre de Control reads it after a deploy to prove that production serves the merged commit
 * (promotion.repos.itbem-events-frontend.versionUrl). The deploy workflow (deploy-worker.yml) builds on GitHub Actions
 * from `ref: github.sha`, so GITHUB_SHA is the commit of the build. Outside Actions the checkout's HEAD is used; when
 * neither is known the file says so with sha null (nothing then matches a merged commit).
 *
 * On GitHub Actions a missing or malformed GITHUB_SHA fails the build: a deploy must never publish an unknown version.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;

/** The commit of this build: GITHUB_SHA on Actions (required there), else the checkout's HEAD, else null. */
export function resolveBuildSha(env = process.env, gitHead = readGitHead) {
  const fromEnv = (env.GITHUB_SHA ?? '').trim().toLowerCase();
  if (env.GITHUB_ACTIONS === 'true') {
    if (!SHA.test(fromEnv)) {
      throw new Error('GITHUB_SHA is missing or is not a 40-character commit sha; refusing to publish an unknown version.');
    }
    return { sha: fromEnv, source: 'GITHUB_SHA' };
  }
  if (SHA.test(fromEnv)) return { sha: fromEnv, source: 'GITHUB_SHA' };
  const head = (gitHead() ?? '').trim().toLowerCase();
  if (SHA.test(head)) return { sha: head, source: 'git' };
  return { sha: null, source: 'unknown' };
}

/** The body of /version.json. builtAt is the build's own clock; it is informative only. */
export function versionDocument({ sha, source }, now = new Date()) {
  return { sha, source, builtAt: now.toISOString() };
}

function readGitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

export function writeVersionFile(outputPath = resolve('dist', 'client', 'version.json'), env = process.env) {
  const doc = versionDocument(resolveBuildSha(env));
  if (!existsSync(dirname(outputPath))) mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(doc) + '\n', 'utf-8');
  return doc;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const doc = writeVersionFile();
  console.log(`version.json written: sha ${doc.sha ?? '(unknown)'} from ${doc.source}`);
}
