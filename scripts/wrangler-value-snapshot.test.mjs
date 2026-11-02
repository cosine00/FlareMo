import assert from "node:assert/strict";
import test from "node:test";
import {
  compareToSnapshot,
  snapshotValues,
} from "./wrangler-value-snapshot.mjs";

const machine = {
  name: "flaremo",
  routes: [{ pattern: "drafts.example.com", custom_domain: true }],
  d1_databases: [
    {
      binding: "DB",
      database_name: "flaremo",
      database_id: "774cda6a-4dbf-4b86-98cd-b6bd3072ed0b",
    },
  ],
  r2_buckets: [
    { binding: "ATTACHMENTS", bucket_name: "flaremo-attachments" },
    { binding: "IMAGES", bucket_name: "image" },
  ],
  triggers: { crons: ["17 3 * * *"] },
  vars: {
    FLAREMO_PUBLIC_URL: "https://drafts.example.com",
    FLAREMO_IMAGE_BED_URL: "https://img.example.com",
    FLAREMO_VAPID_PUBLIC_KEY: "public-key-material",
    FLAREMO_VAPID_PRIVATE_KEY: "private-key-material",
    BETTER_AUTH_SECRET: "signing-material",
    FLAREMO_TRUSTED_ORIGINS: "",
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("a snapshot keeps public values and never the secret ones", () => {
  const snapshot = snapshotValues(clone(machine));
  assert.equal(snapshot.vars.FLAREMO_PUBLIC_URL, "https://drafts.example.com");
  assert.equal(snapshot.vars.FLAREMO_VAPID_PUBLIC_KEY, "public-key-material");
  assert.equal(snapshot.vars.FLAREMO_VAPID_PRIVATE_KEY, undefined);
  assert.equal(snapshot.vars.BETTER_AUTH_SECRET, undefined);
  assert.deepEqual(snapshot.secretsPresent, [
    "BETTER_AUTH_SECRET",
    "FLAREMO_VAPID_PRIVATE_KEY",
  ]);
  assert.ok(!JSON.stringify(snapshot).includes("private-key-material"));
  assert.ok(!JSON.stringify(snapshot).includes("signing-material"));
});

test("empty vars and empty var slots are dropped", () => {
  const snapshot = snapshotValues(clone(machine));
  assert.equal("FLAREMO_TRUSTED_ORIGINS" in snapshot.vars, false);
});

test("the same config on another machine reports no differences", () => {
  const report = compareToSnapshot(
    snapshotValues(clone(machine)),
    clone(machine),
  );
  assert.deepEqual(report.differences, []);
});

test("a mistyped D1 id is reported against the baseline", () => {
  const other = clone(machine);
  other.d1_databases[0].database_id = "774cda6a-4dbf-4b86-98cd-b6bd3072ed0c";
  const report = compareToSnapshot(snapshotValues(clone(machine)), other);
  assert.equal(report.differences.length, 1);
  assert.equal(report.differences[0].key, "d1_databases[DB].database_id");
  assert.equal(report.differences[0].kind, "differs");
});

test("a missing route and a missing custom domain are both caught", () => {
  const noRoutes = clone(machine);
  noRoutes.routes = [];
  assert.match(
    compareToSnapshot(snapshotValues(clone(machine)), noRoutes).differences[0]
      .key,
    /routes\[drafts\.example\.com\]/,
  );

  const zoneRoute = clone(machine);
  zoneRoute.routes = [{ pattern: "drafts.example.com" }];
  const report = compareToSnapshot(snapshotValues(clone(machine)), zoneRoute);
  assert.equal(report.differences[0].kind, "differs");
  assert.equal(report.differences[0].actual, "zone");
});

test("a renamed image bucket is reported", () => {
  const other = clone(machine);
  other.r2_buckets[1].bucket_name = "flaremo-images";
  const report = compareToSnapshot(snapshotValues(clone(machine)), other);
  assert.equal(report.differences.length, 1);
  assert.equal(report.differences[0].key, "r2_buckets[IMAGES].bucket_name");
});

test("an empty PUBLIC_URL is a difference, not a silently skipped var", () => {
  const other = clone(machine);
  other.vars.FLAREMO_PUBLIC_URL = "";
  const report = compareToSnapshot(snapshotValues(clone(machine)), other);
  assert.equal(report.differences.length, 1);
  assert.equal(report.differences[0].kind, "missing");
});

test("cron order does not matter but a different schedule does", () => {
  const reordered = clone(machine);
  reordered.triggers.crons = ["17 3 * * *", "0 4 * * *"];
  const same = clone(machine);
  same.triggers.crons = ["0 4 * * *", "17 3 * * *"];
  assert.deepEqual(
    compareToSnapshot(snapshotValues(clone(reordered)), same).differences,
    [],
  );

  const changed = clone(machine);
  changed.triggers.crons = ["17 4 * * *"];
  assert.equal(
    compareToSnapshot(snapshotValues(clone(machine)), changed).differences[0]
      .key,
    "crons",
  );
});

test("extra local-only values are reported separately and do not block", () => {
  const other = clone(machine);
  other.vars.FLAREMO_TRUSTED_ORIGINS = "https://app.example.com";
  const report = compareToSnapshot(snapshotValues(clone(machine)), other);
  assert.equal(report.differences.length, 1);
  assert.equal(report.differences[0].kind, "extra");
});
