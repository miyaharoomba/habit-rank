import assert from "node:assert/strict";
import test from "node:test";
import { BRACES_EXCEPTION, evaluateAudit, readAudit, auditWithRetry } from "../scripts/check-dependency-audit.mjs";

const now = new Date("2026-10-22T00:00:00Z");
const report = (vulnerabilities = {}) => ({
  auditReportVersion: 2, vulnerabilities,
  metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } },
});
function reviewed() {
  const full = report({
    braces: { severity: "high", nodes: ["node_modules/braces"], via: [{
      dependency: "braces", url: BRACES_EXCEPTION.advisory, severity: "high", range: "<=3.0.3",
    }] },
    micromatch: { severity: "high", nodes: ["node_modules/micromatch"], via: ["braces"] },
  });
  const lock = { packages: {
    "node_modules/braces": { dev: true, version: "3.0.3" },
    "node_modules/micromatch": { dev: true, version: "4.0.8" },
  } };
  return { full, lock };
}

test("audit accepts only the reviewed dev chain and reports it explicitly", () => {
  const { full, lock } = reviewed();
  assert.deepEqual(evaluateAudit(full, report(), lock, now), {
    failures: [], deferred: ["braces", "micromatch"],
  });
  assert.deepEqual(evaluateAudit(report(), report(), lock, now), { failures: [], deferred: [] });
});

test("audit blocks production findings, unknown advisories, paths and severities", () => {
  const { full, lock } = reviewed();
  assert.ok(evaluateAudit(full, full, lock, now).failures.length);
  for (const mutate of [
    value => {
      value.vulnerabilities.next = { severity: "critical", nodes: ["node_modules/next"], via: [{ url: "NEW" }] };
      value.metadata.vulnerabilities.total++;
    },
    value => { value.vulnerabilities.braces.via[0].url = "https://github.com/advisories/NEW"; },
    value => { value.vulnerabilities.braces.via.push({ url: "NEW" }); },
    value => { value.vulnerabilities.braces.severity = "critical"; },
    value => { value.vulnerabilities.braces.nodes = ["node_modules/unknown/node_modules/braces"]; },
    value => { value.vulnerabilities.micromatch.via = ["missing"]; },
    value => { value.vulnerabilities.micromatch.via = ["micromatch"]; },
  ]) {
    const changed = structuredClone(full);
    mutate(changed);
    assert.ok(evaluateAudit(changed, report(), lock, now).failures.length);
  }
  lock.packages["node_modules/braces"].dev = false;
  assert.ok(evaluateAudit(full, report(), lock, now).failures.length);
});

test("audit exception expires, fails closed, and does not exempt future versions", () => {
  const { full, lock } = reviewed();
  assert.ok(evaluateAudit(full, report(), lock, new Date(BRACES_EXCEPTION.expires)).failures.length);
  assert.ok(evaluateAudit(full, report(), lock, new Date("invalid")).failures.length);
  lock.packages["node_modules/braces"].version = "3.0.4";
  assert.ok(evaluateAudit(full, report(), lock, now).failures.length);
  for (const invalid of [{}, { error: { code: "ENETUNREACH" } }, report({ a: {} })]) {
    if (invalid.metadata) invalid.metadata.vulnerabilities.total = 0;
    assert.throws(() => evaluateAudit(invalid, report(), lock, now), /Invalid/);
  }
});

test("audit accepts npm exit 1 findings but rejects timeouts, broken JSON and registry errors", async () => {
  const { full } = reviewed();
  const result = await readAudit("npm-cli.js", [], async (_file, args, options) => {
    assert.ok(args.includes("--fetch-timeout=15000"));
    assert.equal(options.timeout, 90_000);
    throw { code: 1, stdout: JSON.stringify(full) };
  });
  assert.deepEqual(result, full);
  for (const error of [{ code: 1, killed: true, stdout: JSON.stringify(full) }, { code: "ENOENT" }]) {
    await assert.rejects(readAudit("npm-cli.js", [], async () => { throw error; }), /could not complete/);
  }
  await assert.rejects(readAudit("npm-cli.js", [], async () => ({ stdout: "not JSON" })));
  await assert.rejects(readAudit("npm-cli.js", [], async () => ({ stdout: JSON.stringify({ error: "registry unavailable" }) })), /Invalid/);
});

test("audit retries transport failures once, never silently accepting a failed retry", async () => {
  let attempts = 0;
  assert.deepEqual(await auditWithRetry("npm-cli.js", [], async () => {
    if (++attempts === 1) throw new Error("temporary registry failure");
    return report();
  }), report());
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(auditWithRetry("npm-cli.js", [], async () => {
    attempts++;
    throw new Error("registry unavailable");
  }), /registry unavailable/);
  assert.equal(attempts, 2);
});
