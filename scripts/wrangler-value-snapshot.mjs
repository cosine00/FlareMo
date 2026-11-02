// Carries the machine-local `wrangler.jsonc` values to a second machine.
//
// The config is git-ignored on purpose: it holds account identifiers that differ
// per deployment, and the upstream design expects it to live as a local file.
// Copying it by hand across machines is where the 36-character D1 id gets
// mistyped, so this module snapshots the values that matter, prints them for a
// password manager, and re-checks a fresh config against that snapshot.
//
// Secret-looking keys are never written: a snapshot records only which of them
// were set, never their values.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonc } from "./wrangler-config-parity.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SECRET_VAR = /(SECRET|PRIVATE|API_KEY|TOKEN)/i;

/**
 * Reduces a wrangler config to the values that must survive a machine change.
 * Secret-like vars are replaced by their names so the snapshot stays safe to
 * paste into a password manager or chat.
 */
export function snapshotValues(config) {
  const vars = {};
  const secretsPresent = [];
  for (const [key, value] of Object.entries(config.vars ?? {})) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (SECRET_VAR.test(key)) {
      if (trimmed) secretsPresent.push(key);
      continue;
    }
    if (trimmed) vars[key] = trimmed;
  }

  return {
    version: 1,
    name: typeof config.name === "string" ? config.name : "",
    routes: (config.routes ?? []).map((route) => ({
      pattern: route.pattern ?? "",
      custom_domain: Boolean(route.custom_domain),
    })),
    d1_databases: (config.d1_databases ?? []).map((database) => ({
      binding: database.binding ?? "",
      database_name: database.database_name ?? "",
      database_id: database.database_id ?? "",
    })),
    r2_buckets: (config.r2_buckets ?? []).map((bucket) => ({
      binding: bucket.binding ?? "",
      bucket_name: bucket.bucket_name ?? "",
    })),
    crons: [...(config.triggers?.crons ?? [])],
    vars,
    secretsPresent: secretsPresent.sort(),
  };
}

function flatten(snapshot) {
  const flat = {};
  flat.name = snapshot.name;
  flat.crons = [...snapshot.crons].sort().join(",");
  for (const route of snapshot.routes) {
    flat[`routes[${route.pattern}]`] = route.custom_domain
      ? "custom_domain"
      : "zone";
  }
  for (const database of snapshot.d1_databases) {
    flat[`d1_databases[${database.binding}].database_id`] =
      database.database_id;
    if (database.database_name) {
      flat[`d1_databases[${database.binding}].database_name`] =
        database.database_name;
    }
  }
  for (const bucket of snapshot.r2_buckets) {
    flat[`r2_buckets[${bucket.binding}].bucket_name`] = bucket.bucket_name;
  }
  for (const [key, value] of Object.entries(snapshot.vars)) {
    flat[`vars.${key}`] = value;
  }
  return flat;
}

/**
 * Compares a saved snapshot against a config read on another machine.
 * Returns every key that is missing, different, or unexpectedly extra.
 */
export function compareToSnapshot(snapshot, config) {
  const expected = flatten(snapshot);
  const actual = flatten(snapshotValues(config));
  const differences = [];

  for (const [key, value] of Object.entries(expected)) {
    if (!(key in actual)) {
      differences.push({ key, kind: "missing", expected: value, actual: "" });
    } else if (actual[key] !== value) {
      differences.push({
        key,
        kind: "differs",
        expected: value,
        actual: actual[key],
      });
    }
  }
  for (const [key, value] of Object.entries(actual)) {
    if (!(key in expected)) {
      differences.push({ key, kind: "extra", expected: "", actual: value });
    }
  }

  return { differences, secretsPresent: snapshot.secretsPresent ?? [] };
}

function readConfig(path) {
  return parseJsonc(readFileSync(path, "utf8"));
}

function formatDifferences(differences) {
  if (differences.length === 0) return "";
  const lines = [];
  const missing = differences.filter((item) => item.kind === "missing");
  const differs = differences.filter((item) => item.kind === "differs");
  const extra = differences.filter((item) => item.kind === "extra");
  if (missing.length > 0) {
    lines.push("Missing here (the baseline has it, this config does not):");
    for (const item of missing) {
      lines.push(`  ${item.key} = ${JSON.stringify(item.expected)}`);
    }
  }
  if (differs.length > 0) {
    lines.push("Different:");
    for (const item of differs) {
      lines.push(
        `  ${item.key}: baseline=${JSON.stringify(item.expected)} here=${JSON.stringify(item.actual)}`,
      );
    }
  }
  if (extra.length > 0) {
    lines.push(
      "Only here (the reference leaves it blank or does not list it):",
    );
    for (const item of extra) {
      lines.push(`  ${item.key} = ${JSON.stringify(item.actual)}`);
    }
  }
  return lines.join("\n");
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function main() {
  const localPath = process.env.WRANGLER_CONFIG ?? join(root, "wrangler.jsonc");
  const local = readConfig(localPath);
  // Positional modes exist so `pnpm config:snapshot` / `pnpm config:check` need
  // no arguments: pnpm would swallow a leading `--save`.
  const savePath =
    argumentValue("save") ??
    (process.argv.includes("snapshot")
      ? join(root, "wrangler-values.json")
      : null);
  const baselinePath =
    argumentValue("baseline") ??
    (process.argv.includes("check")
      ? join(root, "wrangler-values.json")
      : null);

  if (savePath) {
    const snapshot = snapshotValues(local);
    writeFileSync(savePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.log(`Wrote a value snapshot to ${savePath}`);
    console.log(
      "It holds no secrets: secret-like vars are recorded by name only. Keep it in a password manager and never commit it.",
    );
    if (snapshot.secretsPresent.length > 0) {
      console.log(
        `This machine has these secret vars set: ${snapshot.secretsPresent.join(", ")}. They are already in the Cloudflare secret store, so the other machine does not need them.`,
      );
    }
    return;
  }

  if (baselinePath) {
    const snapshot = JSON.parse(readFileSync(baselinePath, "utf8"));
    const { differences, secretsPresent } = compareToSnapshot(snapshot, local);
    if (differences.length === 0) {
      console.log(
        `Values match the snapshot (${baselinePath}). This machine is configured like the one that produced it.`,
      );
      if (secretsPresent.length > 0) {
        console.log(
          `Reminder: the snapshot lists ${secretsPresent.join(", ")} as set elsewhere; those live in the Cloudflare secret store and are untouched by deploy.`,
        );
      }
      return;
    }
    console.error(
      `wrangler.jsonc does not match the snapshot from ${baselinePath}:`,
    );
    console.error(formatDifferences(differences));
    console.error(
      "Edit wrangler.jsonc until this passes, then run `pnpm deploy:preflight`.",
    );
    process.exit(1);
  }

  const example = readConfig(join(root, "wrangler.jsonc.example"));
  const differences = compareToSnapshot(
    snapshotValues(example),
    local,
  ).differences;
  if (differences.length === 0) {
    console.log(
      "wrangler.jsonc carries no deployment-specific values beyond the example.",
    );
    return;
  }
  console.log(
    "Values this machine sets that the example does not. On a fresh copy, these are exactly the lines you must fill in:",
  );
  console.log(formatDifferences(differences));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
