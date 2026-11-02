import assert from "node:assert/strict";
import test from "node:test";
import {
  compareConfigs,
  parseJsonc,
  stripJsonComments,
} from "./wrangler-config-parity.mjs";

const base = {
  main: "./apps/worker/src/index.ts",
  compatibility_date: "2026-07-10",
  assets: {
    directory: "./apps/web/dist",
    not_found_handling: "single-page-application",
    run_worker_first: ["/api/*", "/feed.xml"],
  },
  d1_databases: [{ binding: "DB", migrations_dir: "./migrations" }],
  r2_buckets: [{ binding: "ATTACHMENTS" }],
  vars: { FLAREMO_PUBLIC_URL: "" },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("strips line and block comments but keeps URLs intact", () => {
  const source = `{
    // a line comment
    "url": "https://img.hux.ink/a.webp", /* inline */
    "num": 1 // trailing
  }`;
  assert.deepEqual(parseJsonc(source), {
    url: "https://img.hux.ink/a.webp",
    num: 1,
  });
  assert.ok(!stripJsonComments(source).includes("a line comment"));
});

test("identical configs report nothing", () => {
  const report = compareConfigs(clone(base), clone(base));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
});

test("a run_worker_first entry missing locally is an error", () => {
  const local = clone(base);
  local.assets.run_worker_first = ["/api/*"];
  const report = compareConfigs(local, clone(base));
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0], /run_worker_first: missing "\/feed\.xml"/);
});

test("a run_worker_first entry only present locally is a warning", () => {
  const local = clone(base);
  local.assets.run_worker_first.push("/extra");
  const report = compareConfigs(local, clone(base));
  assert.deepEqual(report.errors, []);
  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0], /local-only "\/extra"/);
});

test("a binding the example declares but the local config lacks is an error", () => {
  const example = clone(base);
  example.r2_buckets.push({ binding: "IMAGES" });
  const report = compareConfigs(clone(base), example);
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0], /R2 binding: missing "IMAGES"/);
});

test("switching not_found_handling is an error", () => {
  const local = clone(base);
  local.assets.not_found_handling = "404-page";
  const report = compareConfigs(local, clone(base));
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0], /not_found_handling/);
});

test("vars present in the example only are a warning, not an error", () => {
  const example = clone(base);
  example.vars.FLAREMO_IMAGE_BED_URL = "";
  const report = compareConfigs(clone(base), example);
  assert.deepEqual(report.errors, []);
  assert.match(report.warnings.join("\n"), /FLAREMO_IMAGE_BED_URL/);
});

test("queue producers and consumers are compared by binding", () => {
  const example = clone(base);
  example.queues = {
    producers: [{ binding: "Q" }],
    consumers: [{ queue: "q" }],
  };
  const report = compareConfigs(clone(base), example);
  assert.equal(report.errors.length, 2);
  assert.match(report.errors.join("\n"), /queue producer: missing "Q"/);
  assert.match(report.errors.join("\n"), /queue consumer: missing "q"/);
});
