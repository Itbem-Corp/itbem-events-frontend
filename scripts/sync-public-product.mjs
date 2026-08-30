import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const contractPath = resolve(
  ".contracts",
  "itbem-product-contract",
  "contract",
  "products.v1.json",
);
const outputPath = resolve("src", "generated", "public-product.json");
const productCode = process.env.PUBLIC_PRODUCT_CODE?.trim() || "eventiapp";
const checkOnly = process.argv.includes("--check");

const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const product = contract.products?.find((candidate) => candidate.code === productCode);

if (!product) {
  throw new Error(`Unknown PUBLIC_PRODUCT_CODE: ${productCode}`);
}
if (product.deployment?.publicExperience?.enabled !== true) {
  throw new Error(`Product ${productCode} has no enabled public experience`);
}

const projection = {
  code: product.code,
  identity: product.identity,
  apiHostname: product.deployment.apiHostname,
  dashboardHostname: product.deployment.dashboardHostname,
  canonicalHostname: product.deployment.publicExperience.canonicalHostname,
  hostnames: product.deployment.publicExperience.hostnames,
  deploymentTarget: product.deployment.publicExperience.deploymentTarget,
  branding: product.deployment.publicExperience.branding,
};
const expected = `${JSON.stringify(projection, null, 2)}\n`;

function assertCiUrl(name, configuredValue, expectedHostname) {
  if (process.env.CI !== "true" || !configuredValue) return;
  const configured = new URL(configuredValue);
  if (
    configured.protocol !== "https:" ||
    configured.hostname !== expectedHostname ||
    configured.username ||
    configured.password ||
    configured.pathname !== "/" ||
    configured.search ||
    configured.hash
  ) {
    throw new Error(`${name} must match the product contract host: https://${expectedHostname}`);
  }
}

assertCiUrl("PUBLIC_EVENTS_URL", process.env.PUBLIC_EVENTS_URL, projection.apiHostname);
assertCiUrl(
  "PUBLIC_DASHBOARD_URL",
  process.env.PUBLIC_DASHBOARD_URL,
  projection.dashboardHostname,
);

if (checkOnly) {
  let current;
  try {
    current = readFileSync(outputPath, "utf8");
  } catch {
    throw new Error("Generated public product is missing; run npm run contract:generate");
  }
  if (current !== expected) {
    throw new Error("Generated public product is stale; run npm run contract:generate");
  }
  console.log(`Public product contract is current: ${productCode}`);
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, expected);
  console.log(`Generated public product contract: ${productCode}`);
}
