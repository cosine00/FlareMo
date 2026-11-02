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

const TEMPLATE_PLACEHOLDER = /^(?:replace|your[-_]|change[-_]?me|<)/i;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Checks the values only the operator can supply.
 *
 * A fresh `cp wrangler.jsonc.example wrangler.jsonc` passes structural parity
 * while carrying an empty `FLAREMO_PUBLIC_URL` and a placeholder D1 id. Deploy
 * either rejects that outright or, worse, accepts it into a half-working site:
 * sign-in fails and the image bed hands out dead URLs. Anyone cloning this repo
 * on a second machine starts from exactly that state.
 *
 * Errors block a local deploy; warnings do not.
 */
export function checkOperatorValues(config) {
  const errors = [];
  const warnings = [];
  const vars = config.vars ?? {};

  const databases = Array.isArray(config.d1_databases)
    ? config.d1_databases
    : [];
  if (databases.length === 0) {
    errors.push(
      "d1_databases: no database configured — `pnpm migrate:remote` has nothing to target",
    );
  }
  for (const database of databases) {
    const binding = text(database.binding) || "DB";
    const id = text(database.database_id);
    if (!id) {
      errors.push(
        `d1_databases[${binding}].database_id is empty — run \`pnpm provision:remote\` (or \`wrangler d1 create\`) and paste the id`,
      );
    } else if (TEMPLATE_PLACEHOLDER.test(id)) {
      errors.push(
        `d1_databases[${binding}].database_id is still the template placeholder "${id}" — paste the id from \`wrangler d1 list\``,
      );
    }
  }

  const publicUrl = text(vars.FLAREMO_PUBLIC_URL);
  if (!publicUrl) {
    errors.push(
      "vars.FLAREMO_PUBLIC_URL is empty — Better Auth signs callbacks and cookies against it, so sign-in fails",
    );
  } else {
    let parsed;
    try {
      parsed = new URL(publicUrl);
    } catch {
      errors.push(`vars.FLAREMO_PUBLIC_URL is not a URL: "${publicUrl}"`);
    }
    if (parsed) {
      if (parsed.protocol !== "https:" && !isLoopbackHost(parsed.hostname)) {
        errors.push(
          `vars.FLAREMO_PUBLIC_URL must use https outside localhost: "${publicUrl}"`,
        );
      }
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
        errors.push(
          `vars.FLAREMO_PUBLIC_URL must be an origin only (no path, query or hash): "${publicUrl}"`,
        );
      }
    }
  }

  const buckets = Array.isArray(config.r2_buckets) ? config.r2_buckets : [];
  for (const bucket of buckets) {
    if (!text(bucket.bucket_name)) {
      errors.push(
        `r2_buckets[${text(bucket.binding) || "?"}].bucket_name is empty`,
      );
    }
  }
  const hasImageBed = buckets.some(
    (bucket) => text(bucket.binding) === "IMAGES",
  );
  const imageBedUrl = text(vars.FLAREMO_IMAGE_BED_URL);
  if (hasImageBed && !imageBedUrl) {
    errors.push(
      "r2_buckets binds IMAGES but vars.FLAREMO_IMAGE_BED_URL is empty — uploaded pictures would get URLs nobody can load",
    );
  }
  if (!hasImageBed && imageBedUrl) {
    errors.push(
      "vars.FLAREMO_IMAGE_BED_URL is set but no R2 binding named IMAGES — image uploads answer 503",
    );
  }

  const crons = config.triggers?.crons;
  if (!Array.isArray(crons) || crons.length === 0) {
    errors.push(
      "triggers.crons is empty — scheduled work (memory digest, the blog-sync fallback) never runs",
    );
  }

  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    warnings.push(
      "routes is empty: the Worker stays on its workers.dev hostname and no custom domain is bound",
    );
  }

  return { errors, warnings };
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
