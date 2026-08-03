import fs from "fs";
import path from "path";
import { IAM_PERMISSIONS } from "./constants.js";
import {
  ADMIN_PAGE_PERMISSIONS,
  normalizeAdminPagePath,
  permissionForAdminPage,
} from "./page-permissions.js";

const ADMIN_APP_ROOT = path.join(process.cwd(), "app", "(app)", "admin");

function walkPageFiles(dir, base = "") {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(...walkPageFiles(full, rel));
      continue;
    }

    if (entry.name === "page.js" || entry.name === "page.tsx") {
      files.push({ abs: full, rel: base });
    }
  }

  return files;
}

function toAdminPath(rel) {
  if (!rel) return "/admin";
  return `/admin/${rel}`.replace(/\/+/g, "/");
}

function isKnownPermission(permissionId) {
  return Object.values(IAM_PERMISSIONS).includes(permissionId);
}

export function discoverAdminPages(adminRoot = ADMIN_APP_ROOT) {
  return walkPageFiles(adminRoot).map(({ abs, rel }) => {
    const pathname = toAdminPath(rel);
    const content = fs.readFileSync(abs, "utf8");
    return {
      abs,
      pathname,
      normalized: normalizeAdminPagePath(pathname),
      content,
      usesIsAdminOnly:
        /\bisAdmin\b/.test(content) &&
        !/PermissionGate|requireIamPageAccess|permissionForAdminPage/.test(content),
    };
  });
}

export function validatePageMatrix(options = {}) {
  const adminRoot = options.adminRoot || ADMIN_APP_ROOT;
  const discovered = discoverAdminPages(adminRoot);
  const matrixPaths = new Set(Object.keys(ADMIN_PAGE_PERMISSIONS));
  const issues = [];
  const covered = [];

  for (const page of discovered) {
    const permission = permissionForAdminPage(page.pathname);
    if (!permission) {
      issues.push({
        type: "missing_page_permission",
        pathname: page.pathname,
        normalized: page.normalized,
        file: page.abs,
      });
      continue;
    }

    if (!isKnownPermission(permission)) {
      issues.push({
        type: "unknown_permission",
        pathname: page.pathname,
        permission,
        file: page.abs,
      });
      continue;
    }

    covered.push({ pathname: page.pathname, permission });
  }

  for (const matrixPath of matrixPaths) {
    if (matrixPath.includes("[")) continue;
    const normalized = normalizeAdminPagePath(matrixPath);
    const hasPage = discovered.some((p) => normalizeAdminPagePath(p.pathname) === normalized);
    if (!hasPage) {
      issues.push({
        type: "orphan_matrix_entry",
        pathname: matrixPath,
      });
    }
  }

  const duplicateCheck = new Map();
  for (const [pathname, permission] of Object.entries(ADMIN_PAGE_PERMISSIONS)) {
    const key = `${normalizeAdminPagePath(pathname)}::${permission}`;
    if (duplicateCheck.has(key)) {
      issues.push({
        type: "duplicate_matrix_entry",
        pathname,
        permission,
        duplicateOf: duplicateCheck.get(key),
      });
    } else {
      duplicateCheck.set(key, pathname);
    }
  }

  for (const page of discovered) {
    if (page.usesIsAdminOnly && page.pathname !== "/admin") {
      issues.push({
        type: "is_admin_only_page",
        pathname: page.pathname,
        file: page.abs,
        severity: "warning",
      });
    }
  }

  return {
    ok: issues.filter((i) => i.type !== "is_admin_only_page" || i.severity !== "warning").length === 0,
    issues,
    covered,
    pageCount: discovered.length,
    matrixCount: matrixPaths.size,
  };
}
