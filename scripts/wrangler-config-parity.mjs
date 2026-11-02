// Structural parity check between the machine-local `wrangler.jsonc`
// (git-ignored) and the tracked `wrangler.jsonc.example`.
//
// Why this exists: `git merge` never touches `wrangler.jsonc`, so an upstream
// commit that adds a `run_worker_first` entry, a binding, or flips
// `not_found_handling` silently stops applying on existing installs. The
// public Memo RSS feed shipped that way: the example gained `/memos.xml`, the
// local config did not, and with SPA not-found handling the asset layer
// answered before the Worker ever ran.
//
// Only structure is compared. Account identifiers, domains, bucket names and
// var values legitimately differ per deployment and are ignored.

const BINDING_GROUPS = [
  { key: "d1_databases", label: "D1", select: (item) => item.binding },
  { key: "r2_buckets", label: "R2", select: (item) => item.binding },
  { key: "kv_namespaces", label: "KV", select: (item) => item.binding },
  {
    key: "durable_objects",
    label: "Durable Object",
    select: (item) => item.name ?? item.class_name,
    path: "bindings",
  },
  { key: "vectorize", label: "Vectorize", select: (item) => item.binding },
];

const QUEUE_GROUPS = [
  {
    path: "producers",
    label: "queue producer",
    select: (item) => item.binding,
  },
  { path: "consumers", label: "queue consumer", select: (item) => item.queue },
];

/** Removes `//` and block comments without touching string contents. */
export function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      out += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (
        index < text.length &&
        !(text[index] === "*" && text[index + 1] === "/")
      )
        index += 1;
      index += 1;
      continue;
    }
    out += char;
  }
  return out;
}

export function parseJsonc(text) {
  return JSON.parse(stripJsonComments(text).replace(/,\s*([}\]])/g, "$1"));
}

function names(items, select) {
  if (!Array.isArray(items)) return [];
  return items.map(select).filter((value) => typeof value === "string");
}

function diffSets(localNames, exampleNames) {
  const localSet = new Set(localNames);
  const exampleSet = new Set(exampleNames);
  return {
    missing: exampleNames.filter((name) => !localSet.has(name)),
    extra: localNames.filter((name) => !exampleSet.has(name)),
  };
}

/**
 * Compares the local deployment config against the tracked example.
 * Returns `{ errors, warnings }`; errors block a deploy, warnings do not.
 */
export function compareConfigs(local, example) {
  const errors = [];
  const warnings = [];

  const structural = [
    ["main", "worker entry"],
    ["compatibility_date", "compatibility_date"],
  ];
  for (const [key, label] of structural) {
    if (local[key] !== example[key]) {
      const message = `${label}: local=${JSON.stringify(local[key])} example=${JSON.stringify(example[key])}`;
      if (key === "compatibility_date") warnings.push(message);
      else errors.push(message);
    }
  }

  const localAssets = local.assets ?? {};
  const exampleAssets = example.assets ?? {};
  if (localAssets.directory !== exampleAssets.directory) {
    errors.push(
      `assets.directory: local=${JSON.stringify(localAssets.directory)} example=${JSON.stringify(exampleAssets.directory)}`,
    );
  }
  if (localAssets.not_found_handling !== exampleAssets.not_found_handling) {
    errors.push(
      `assets.not_found_handling: local=${JSON.stringify(localAssets.not_found_handling)} example=${JSON.stringify(exampleAssets.not_found_handling)}`,
    );
  }

  const { missing, extra } = diffSets(
    localAssets.run_worker_first ?? [],
    exampleAssets.run_worker_first ?? [],
  );
  for (const path of missing) {
    errors.push(
      `run_worker_first: missing "${path}" — the SPA not-found handling answers before the Worker, so the route will 404/HTML instead of running`,
    );
  }
  for (const path of extra) {
    warnings.push(
      `run_worker_first: local-only "${path}" (the example does not list it)`,
    );
  }

  for (const group of BINDING_GROUPS) {
    const localItems = group.path
      ? (local[group.key]?.[group.path] ?? [])
      : (local[group.key] ?? []);
    const exampleItems = group.path
      ? (example[group.key]?.[group.path] ?? [])
      : (example[group.key] ?? []);
    const diff = diffSets(
      names(localItems, group.select),
      names(exampleItems, group.select),
    );
    if (diff.missing.length > 0) {
      errors.push(
        `${group.label} binding: missing ${diff.missing.map((name) => `"${name}"`).join(", ")} — the code calls it and will fail at runtime`,
      );
    }
    if (diff.extra.length > 0) {
      warnings.push(
        `${group.label} binding: local-only ${diff.extra.map((name) => `"${name}"`).join(", ")}`,
      );
    }
  }

  for (const group of QUEUE_GROUPS) {
    const diff = diffSets(
      names(local.queues?.[group.path], group.select),
      names(example.queues?.[group.path], group.select),
    );
    if (diff.missing.length > 0) {
      errors.push(
        `${group.label}: missing ${diff.missing.map((name) => `"${name}"`).join(", ")}`,
      );
    }
    if (diff.extra.length > 0) {
      warnings.push(
        `${group.label}: local-only ${diff.extra.map((name) => `"${name}"`).join(", ")}`,
      );
    }
  }

  const localVars = Object.keys(local.vars ?? {});
  const exampleVars = Object.keys(example.vars ?? {});
  for (const key of exampleVars) {
    if (!localVars.includes(key)) {
      warnings.push(
        `vars: "${key}" is in the example but not here (the code default applies)`,
      );
    }
  }
  for (const key of localVars) {
    if (!exampleVars.includes(key)) {
      warnings.push(`vars: local-only "${key}" (the example does not list it)`);
    }
  }

  const localMigrations = (local.d1_databases ?? []).map(
    (item) => item.migrations_dir,
  );
  const exampleMigrations = (example.d1_databases ?? []).map(
    (item) => item.migrations_dir,
  );
  if (JSON.stringify(localMigrations) !== JSON.stringify(exampleMigrations)) {
    warnings.push(
      `d1_databases[].migrations_dir: local=${JSON.stringify(localMigrations)} example=${JSON.stringify(exampleMigrations)}`,
    );
  }

  return { errors, warnings };
}
