const fs = require("fs");
const path = require("path");

const API_URL = process.env.SKRIME_API_URL;
const API_KEY = process.env.SKRIME_API_KEY;
const PRODUCTS_RAW = process.env.SKRIME_PRODUCTS;

const root = process.cwd();
const domainsDir = path.join(root, "domains");

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

if (!API_URL) fail("SKRIME_API_URL secret is not set.");
if (!API_KEY) fail("SKRIME_API_KEY secret is not set.");
if (!PRODUCTS_RAW) fail("SKRIME_PRODUCTS secret is not set.");

let products;
try {
  products = JSON.parse(PRODUCTS_RAW);
} catch (e) {
  fail(`SKRIME_PRODUCTS secret is not valid JSON: ${e.message}`);
}

const domains = fs
  .readdirSync(domainsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

function collectRecords(domain) {
  const records = [];
  const domainDir = path.join(domainsDir, domain);
  if (!fs.existsSync(domainDir)) return records;

  for (const sub of fs.readdirSync(domainDir)) {
    const subDir = path.join(domainDir, sub);
    if (!fs.statSync(subDir).isDirectory()) continue;

    for (const file of fs.readdirSync(subDir)) {
      if (!file.endsWith(".json")) continue;
      const label = file.replace(/\.json$/, "");
      const name = label === "@" ? sub : `${label}.${sub}`;

      const data = JSON.parse(fs.readFileSync(path.join(subDir, file), "utf8"));
      const recs = data.records || {};
      for (const [type, value] of Object.entries(recs)) {
        const values = Array.isArray(value) ? value : [value];
        for (const v of values) {
          records.push({ name, type, data: String(v) });
        }
      }
    }
  }
  return records;
}

async function deployZone(domain, productId) {
  const records = collectRecords(domain);
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ productId, records }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${domain}: HTTP ${res.status} ${text}`);
  }
  console.log(`[ok]   ${domain}: pushed ${records.length} record(s) (HTTP ${res.status})`);
}

(async () => {
  let failed = false;
  for (const domain of domains) {
    const productId = products[domain];
    if (!productId) {
      console.log(`[skip] ${domain}: no productId in SKRIME_PRODUCTS secret`);
      continue;
    }
    try {
      await deployZone(domain, productId);
    } catch (e) {
      failed = true;
      console.error(`[fail] ${e.message}`);
    }
  }
  if (failed) process.exit(1);
})();
