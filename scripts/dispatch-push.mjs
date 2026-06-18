#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    let value = rawValue.trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (quoted) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function getArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const dryRun = process.argv.includes("--dry-run");
const secret = process.env.PUSH_DISPATCH_SECRET;
const target =
  getArg("url") ??
  process.env.PUSH_DISPATCH_URL ??
  "https://habit-rank.vercel.app/api/push/dispatch";

const url = target.endsWith("/api/push/dispatch")
  ? target
  : `${target.replace(/\/$/, "")}/api/push/dispatch`;

if (!secret) {
  console.error("PUSH_DISPATCH_SECRET is missing. Set it in .env.local or this shell.");
  process.exit(1);
}

console.log(`Dispatch endpoint: ${url}`);
console.log(`PUSH_DISPATCH_SECRET: loaded (${secret.length} chars)`);

if (dryRun) {
  console.log("Dry run only. No notifications were sent.");
  process.exit(0);
}

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-push-secret": secret,
  },
});

const text = await response.text();
console.log(`HTTP ${response.status} ${response.statusText}`);

try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}

if (!response.ok) {
  process.exit(1);
}
