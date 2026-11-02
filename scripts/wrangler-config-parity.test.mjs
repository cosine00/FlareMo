import assert from "node:assert/strict";
import test from "node:test";
import {
  checkOperatorValues,
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

const deployable = {
  triggers: { crons: ["17 3 * * *"] },
  routes: [{ pattern: "drafts.example.com", custom_domain: true }],
  d1_databases: [
    { binding: "DB", database_id: "774cda6a-4dbf-4b86-98cd-b6bd3072ed0b" },
  ],
  r2_buckets: [
    { binding: "ATTACHMENTS", bucket_name: "flaremo-attachments" },
    { binding: "IMAGES", bucket_name: "image" },
  ],
  vars: {
    FLAREMO_PUBLIC_URL: "https://drafts.example.com",
    FLAREMO_IMAGE_BED_URL: "https://img.example.com",
  },
};

test("a fully filled config reports no operator problems", () => {
  const report = checkOperatorValues(clone(deployable));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
});

test("the example's placeholder D1 id is an error", () => {
  const config = clone(deployable);
  config.d1_databases[0].database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID";
  const report = checkOperatorValues(config);
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0], /still the template placeholder/);
});

test("an empty D1 id and an empty database list are both errors", () => {
  const blank = clone(deployable);
  blank.d1_databases[0].database_id = "";
  assert.match(checkOperatorValues(blank).errors[0], /database_id is empty/);

  const none = clone(deployable);
  none.d1_databases = [];
  assert.match(checkOperatorValues(none).errors[0], /no database configured/);
});

test("an empty PUBLIC_URL is an error because sign-in depends on it", () => {
  const config = clone(deployable);
  config.vars.FLAREMO_PUBLIC_URL = "";
  const report = checkOperatorValues(config);
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0], /FLAREMO_PUBLIC_URL is empty/);
});

test("PUBLIC_URL must be https and an origin only", () => {
  const insecure = clone(deployable);
  insecure.vars.FLAREMO_PUBLIC_URL = "http://drafts.example.com";
  assert.match(
    checkOperatorValues(insecure).errors[0],
    /must use https outside localhost/,
  );

  const withPath = clone(deployable);
  withPath.vars.FLAREMO_PUBLIC_URL = "https://drafts.example.com/memos";
  assert.match(checkOperatorValues(withPath).errors[0], /origin only/);

  const local = clone(deployable);
  local.vars.FLAREMO_PUBLIC_URL = "http://localhost:8787";
  assert.deepEqual(checkOperatorValues(local).errors, []);
});

test("the IMAGES binding and the image-bed URL must be paired", () => {
  const unbound = clone(deployable);
  unbound.r2_buckets = unbound.r2_buckets.filter(
    (bucket) => bucket.binding !== "IMAGES",
  );
  assert.match(
    checkOperatorValues(unbound).errors[0],
    /no R2 binding named IMAGES/,
  );

  const noUrl = clone(deployable);
  noUrl.vars.FLAREMO_IMAGE_BED_URL = "";
  assert.match(
    checkOperatorValues(noUrl).errors[0],
    /FLAREMO_IMAGE_BED_URL is empty/,
  );
});

test("an empty crons list is an error and an empty routes list is only a note", () => {
  const config = clone(deployable);
  config.triggers.crons = [];
  config.routes = [];
  const report = checkOperatorValues(config);
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0], /triggers\.crons is empty/);
  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0], /routes is empty/);
});
