import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const assetsDirectory = resolve("dist", "client", "_astro");
const kib = 1024;
const namedBudgets = {
  "client.*.js": 64 * kib,
  "signedMedia.*.js": 60 * kib,
  "template.*.css": 18 * kib,
  "SharedUploadPage.*.js": 16 * kib,
};
const aggregateBudgets = {
  javascript: 300 * kib,
  css: 24 * kib,
};

if (!existsSync(assetsDirectory)) {
  throw new Error("Bundle assets are missing. Run npm run build before checking budgets.");
}

const files = readdirSync(assetsDirectory);
const failures = [];
const gzipSize = (file) => gzipSync(readFileSync(resolve(assetsDirectory, file))).byteLength;
const formatSize = (bytes) => `${(bytes / kib).toFixed(1)} KiB gzip`;

for (const [pattern, maximum] of Object.entries(namedBudgets)) {
  const matcher = new RegExp(`^${pattern.replaceAll(".", "\\.").replaceAll("*", ".*")}$`);
  const match = files.find((file) => matcher.test(file));
  if (!match) {
    failures.push(`${pattern}: expected emitted asset was not found`);
    continue;
  }
  const actual = gzipSize(match);
  if (actual > maximum) {
    failures.push(`${match}: ${formatSize(actual)} > ${formatSize(maximum)}`);
  }
}

const totals = { javascript: 0, css: 0 };
for (const file of files) {
  if (file.endsWith(".js")) totals.javascript += gzipSize(file);
  if (file.endsWith(".css")) totals.css += gzipSize(file);
}
for (const [kind, maximum] of Object.entries(aggregateBudgets)) {
  if (totals[kind] > maximum) {
    failures.push(`all ${kind}: ${formatSize(totals[kind])} > ${formatSize(maximum)}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Bundle budgets exceeded:\n${failures.join("\n")}`);
}

console.log(
  `Bundle budgets passed: ${formatSize(totals.javascript)} JavaScript, ${formatSize(totals.css)} CSS.`,
);
