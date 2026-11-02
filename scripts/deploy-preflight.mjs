// Deploy preflight for `pnpm deploy`. Validates that the operator provided a
// real BETTER_AUTH_SECRET before a local production deploy, and that the
// machine-local `wrangler.jsonc` did not drift behind the tracked example.
//
// CI build environments (Workers Builds / Deploy to Cloudflare) do not carry
// operator secrets: the live Worker keeps its secret in the Worker secret
// store, and first-time setups run `wrangler secret put` after the initial
// deploy (docs/deploy.md). Hard-failing there broke every automated first
// deploy in v0.15.0, so CI (`CI=true`) only gets a warning; local deploys
// keep the gate.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkOperatorValues,
  compareConfigs,
  parseJsonc,
} from "./wrangler-config-parity.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const isCi = process.env.CI === "true" || process.env.CI === "1";

function checkConfigParity() {
  // Overridable so the drift path can be exercised without touching the real
  // (git-ignored, unrecoverable) local config.
  const localPath = process.env.WRANGLER_CONFIG ?? join(root, "wrangler.jsonc");
  const examplePath =
    process.env.WRANGLER_CONFIG_EXAMPLE ?? join(root, "wrangler.jsonc.example");
  if (!existsSync(examplePath)) {
    console.warn("Config parity skipped: wrangler.jsonc.example is missing.");
    return;
  }
  if (!existsSync(localPath)) {
    console.warn(
      "Config parity skipped: no wrangler.jsonc yet. Copy wrangler.jsonc.example and fill in your account values.",
    );
    return;
  }

  const local = parseJsonc(readFileSync(localPath, "utf8"));
  const { errors, warnings } = compareConfigs(
    local,
    parseJsonc(readFileSync(examplePath, "utf8")),
  );
  for (const warning of warnings) console.warn(`Config note: ${warning}`);
  if (errors.length > 0) {
    console.error(
      "wrangler.jsonc drifted from wrangler.jsonc.example. `git merge` never updates the local file, so upstream changes silently stop applying:",
    );
    for (const error of errors) console.error(`  - ${error}`);
    console.error(
      "Review the example and port the missing entries into wrangler.jsonc (keep your own ids/domains).",
    );
    process.exit(1);
  }

  // Structure can match the example while the operator-supplied values are
  // still blank — that is the state of a fresh clone on a second machine.
  const operator = checkOperatorValues(local);
  for (const warning of operator.warnings) {
    console.warn(`Config note: ${warning}`);
  }
  if (operator.errors.length > 0) {
    const detail = operator.errors.map((error) => `  - ${error}`).join("\n");
    if (isCi) {
      console.warn(
        `Config warning (CI): wrangler.jsonc is missing these values:\n${detail}`,
      );
    } else {
      console.error(
        "wrangler.jsonc is missing values only the operator can supply. Copying wrangler.jsonc.example leaves these blank, so deploying now would either fail or produce a half-working site:",
      );
      console.error(detail);
      console.error(
        "Fill them in wrangler.jsonc (see docs/deploy.md). `pnpm provision:remote` can create the resources and write the D1 id back.",
      );
      process.exit(1);
    }
  }

  console.log(
    `Config parity passed: wrangler.jsonc matches the example${warnings.length + operator.warnings.length > 0 ? ` (${warnings.length + operator.warnings.length} note(s))` : ""}.`,
  );
}

checkConfigParity();

const secret = process.env.BETTER_AUTH_SECRET?.trim();

let problem;
if (!secret || secret.length < 32) {
  problem =
    "BETTER_AUTH_SECRET must be set to a generated value of at least 32 characters before deployment.";
} else if (/^(change[-_ ]?me|secret|password|test|dev)$/i.test(secret)) {
  problem =
    "BETTER_AUTH_SECRET still uses a known placeholder. Generate a unique production secret before deployment.";
} else if (new Set(secret).size < 12) {
  problem =
    "BETTER_AUTH_SECRET has too little character diversity; generate a random secret.";
}

if (problem) {
  if (isCi) {
    console.warn(
      `Deploy preflight warning (CI): ${problem}\n` +
        "Configure the live Worker secret via `wrangler secret put BETTER_AUTH_SECRET` before going live.",
    );
    console.log(
      "Deployment preflight passed in CI mode (secret warning only).",
    );
    process.exit(0);
  }
  console.error(problem);
  process.exit(1);
}

console.log("Deployment preflight passed: Better Auth secret is configured.");
