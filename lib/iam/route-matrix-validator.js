import fs from "fs";
import path from "path";
import {
  ROUTE_PERMISSIONS,
  ACTION_ROUTE_PERMISSIONS,
  MACHINE_AUTH_ROUTES,
  routeKey,
  isProtectedAdminRoute,
} from "./route-permissions.js";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function walkRouteFiles(dir, base = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(...walkRouteFiles(full, rel));
      continue;
    }

    if (entry.name === "route.js" || entry.name === "route.ts") {
      files.push({ abs: full, rel: rel.replace(/\/route\.(js|ts)$/, "") });
    }
  }

  return files;
}

function detectExportedMethods(fileContent) {
  const methods = new Set();
  for (const method of HTTP_METHODS) {
    const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
    if (re.test(fileContent)) methods.add(method);
  }
  return methods;
}

function toApiPath(rel) {
  return `/api/${rel}`.replace(/\/+/g, "/");
}

function canonicalizeMatrixKey(key) {
  const [method, ...rest] = key.split(" ");
  const pathname = rest.join(" ");
  return routeKey(method, pathname);
}

export function discoverApiRoutes(apiRoot) {
  const root = apiRoot || path.join(process.cwd(), "app", "api");
  const routeFiles = walkRouteFiles(root);

  return routeFiles.map(({ abs, rel }) => {
    const content = fs.readFileSync(abs, "utf8");
    const methods = detectExportedMethods(content);
    const pathname = toApiPath(rel);
    return { abs, pathname, methods: [...methods], content };
  });
}

export function validateRouteMatrix(options = {}) {
  const apiRoot = options.apiRoot;
  const discovered = discoverApiRoutes(apiRoot);

  const matrixStaticKeys = new Set(
    Object.keys(ROUTE_PERMISSIONS).map((k) => canonicalizeMatrixKey(k))
  );
  const matrixActionKeys = new Set(
    Object.keys(ACTION_ROUTE_PERMISSIONS).map((k) => canonicalizeMatrixKey(k))
  );
  const machineKeys = new Set(MACHINE_AUTH_ROUTES.map((k) => canonicalizeMatrixKey(k)));

  const issues = [];
  const covered = [];
  const adminRoutes = [];

  for (const route of discovered) {
    for (const method of route.methods) {
      const key = routeKey(method, route.pathname);
      const adminRoute = isProtectedAdminRoute(method, route.pathname);

      if (!adminRoute) continue;

      adminRoutes.push({ ...route, method, key });

      const inStatic = matrixStaticKeys.has(key);
      const inAction = matrixActionKeys.has(key);
      const inMachine = machineKeys.has(key);

      if (inMachine) {
        covered.push({ key, type: "machine" });
        continue;
      }

      if (inAction) {
        const actions = ACTION_ROUTE_PERMISSIONS[Object.keys(ACTION_ROUTE_PERMISSIONS).find(
          (k) => canonicalizeMatrixKey(k) === key
        )];
        if (!actions || Object.keys(actions).filter((a) => a !== "default").length === 0) {
          issues.push({
            type: "action_route_missing_actions",
            key,
            file: route.abs,
          });
        } else {
          covered.push({ key, type: "action" });
        }
        continue;
      }

      if (inStatic) {
        const perm = ROUTE_PERMISSIONS[Object.keys(ROUTE_PERMISSIONS).find(
          (k) => canonicalizeMatrixKey(k) === key
        )];
        if (perm === null && route.pathname === "/api/iam/me") {
          covered.push({ key, type: "authenticated_only" });
        } else if (!perm) {
          issues.push({ type: "missing_permission", key, file: route.abs });
        } else {
          covered.push({ key, type: "static" });
        }
        continue;
      }

      issues.push({ type: "missing_route", key, file: route.abs });
    }
  }

  const discoveredKeys = new Set(adminRoutes.map((r) => r.key));

  for (const key of matrixStaticKeys) {
    if (!discoveredKeys.has(key) && !machineKeys.has(key)) {
      issues.push({ type: "orphan_mapping", key });
    }
  }

  for (const key of matrixActionKeys) {
    if (!discoveredKeys.has(key)) {
      issues.push({ type: "orphan_action_mapping", key });
    }
  }

  const duplicateCheck = new Map();
  for (const key of [...matrixStaticKeys, ...matrixActionKeys]) {
    duplicateCheck.set(key, (duplicateCheck.get(key) || 0) + 1);
  }
  for (const [key, count] of duplicateCheck) {
    if (count > 1) {
      issues.push({ type: "duplicate_mapping", key, count });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    covered,
    stats: {
      discoveredAdminRoutes: adminRoutes.length,
      staticMappings: matrixStaticKeys.size,
      actionMappings: matrixActionKeys.size,
      machineRoutes: machineKeys.size,
      issueCount: issues.length,
    },
  };
}

export function assertRouteMatrixValid(options = {}) {
  const result = validateRouteMatrix(options);
  if (!result.ok) {
    const summary = result.issues
      .map((i) => `[${i.type}] ${i.key || ""} ${i.file || ""}`)
      .join("\n");
    throw new Error(`Route matrix validation failed:\n${summary}`);
  }
  return result;
}
