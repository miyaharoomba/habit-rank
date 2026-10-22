import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

// Temporary risk acceptance, not a claim that upstream braces is patched.
export const BRACES_EXCEPTION = Object.freeze({
  advisory: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  expires: "2026-11-21T00:00:00Z",
  packages: [
    "@next/eslint-plugin-next", "braces", "chokidar", "eslint-config-next",
    "fast-glob", "micromatch", "tailwindcss",
  ],
});

function vulnerabilities(report) {
  if (report?.auditReportVersion !== 2 || report.error ||
      !report.vulnerabilities || !report.metadata?.vulnerabilities ||
      report.metadata.vulnerabilities.total !== Object.keys(report.vulnerabilities).length) {
    throw new Error("Invalid/incomplete npm audit report (network failures are not accepted).");
  }
  return report.vulnerabilities;
}

export function evaluateAudit(fullReport, productionReport, lock, now = new Date()) {
  const full = vulnerabilities(fullReport);
  const production = vulnerabilities(productionReport);
  const failures = Object.keys(production).map(name => `Production vulnerability: ${name}`);
  const known = new Set(BRACES_EXCEPTION.packages);
  const expired = !Number.isFinite(now.getTime()) || now >= new Date(BRACES_EXCEPTION.expires);

  function onlyKnownAdvisory(name, seen = new Set()) {
    const item = full[name];
    if (!item || seen.has(name) || !known.has(name) ||
        !["low", "moderate", "high"].includes(item.severity) ||
        !Array.isArray(item.via) || item.via.length === 0) return false;
    const visited = new Set([...seen, name]);
    return item.via.every(via => typeof via === "string"
      ? onlyKnownAdvisory(via, visited)
      : name === "braces" && via.dependency === "braces" &&
        via.url === BRACES_EXCEPTION.advisory && via.severity === "high" &&
        via.range === "<=3.0.3");
  }

  const deferred = [];
  for (const [name, item] of Object.entries(full)) {
    // Require the exact reviewed development-only locations; never trust severity alone.
    const paths = name === "fast-glob"
      ? ["node_modules/fast-glob", "node_modules/tailwindcss/node_modules/fast-glob"]
      : [`node_modules/${name}`];
    const developmentOnly = Array.isArray(item.nodes) && item.nodes.length > 0 &&
      item.nodes.every(path => paths.includes(path) && lock?.packages?.[path]?.dev === true);
    const reviewedVersion = name !== "braces" ||
      lock?.packages?.["node_modules/braces"]?.version === "3.0.3";
    if (expired || !developmentOnly || !reviewedVersion || !onlyKnownAdvisory(name)) {
      failures.push(`Unaccepted vulnerability: ${name}${expired ? " (exception expired)" : ""}`);
    } else {
      deferred.push(name);
    }
  }
  return { failures, deferred };
}

export async function readAudit(npmCli, args, run = promisify(execFile)) {
  let stdout;
  try {
    ({ stdout } = await run(process.execPath, [npmCli, "audit", "--json", ...args,
      "--fetch-timeout=15000", "--fetch-retries=1",
      "--fetch-retry-mintimeout=1000", "--fetch-retry-maxtimeout=2000",
    ], {
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    }));
  } catch (error) {
    // npm returns 1 for a valid report with findings. Every other failure is fatal.
    if (error.code !== 1 || error.killed || !error.stdout) {
      throw new Error(`npm audit could not complete (${error.killed ? "90s timeout" : error.code || "execution failure"}).`);
    }
    stdout = error.stdout;
  }
  const report = JSON.parse(stdout);
  vulnerabilities(report);
  return report;
}

export async function auditWithRetry(npmCli, args, attempt = readAudit) {
  try {
    return await attempt(npmCli, args);
  } catch (error) {
    console.warn(`Audit request failed; retrying once: ${error.message}`);
    return attempt(npmCli, args);
  }
}

async function main() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run via npm run audit:check.");
  const [full, production, lock] = await Promise.all([
    auditWithRetry(npmCli, []),
    auditWithRetry(npmCli, ["--omit=dev"]),
    readFile(new URL("../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const result = evaluateAudit(full, production, lock);
  console.log(`Production findings: ${Object.keys(production.vulnerabilities).length}`);
  if (result.deferred.length) {
    console.warn(`UNRESOLVED development findings (${result.deferred.length}): ${result.deferred.join(", ")}`);
    console.warn(`Temporary exception expires ${BRACES_EXCEPTION.expires}: ${BRACES_EXCEPTION.advisory}`);
  }
  if (result.failures.length) throw new Error(result.failures.join("\n"));
  console.log("Audit policy passed. Deferred findings are NOT fixed or hidden.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
