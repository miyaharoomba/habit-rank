import assert from "node:assert/strict";
import test from "node:test";
import { BRACES_EXCEPTION, evaluateAudit } from "../scripts/check-dependency-audit.mjs";

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
