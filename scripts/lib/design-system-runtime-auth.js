import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function loadRuntimeCredentials() {
  const merged = {
    ...parseEnvFile(path.join(ROOT, ".env.local")),
    ...parseEnvFile(path.join(ROOT, ".env.e2e.local")),
    ...process.env,
  };
  return {
    adminEmail: merged.E2E_ADMIN_EMAIL?.trim() || "",
    adminPass: merged.E2E_ADMIN_PASS || "",
    hasAdminCredentials: Boolean(merged.E2E_ADMIN_EMAIL && merged.E2E_ADMIN_PASS),
  };
}

export function maskIdentifier(value) {
  const raw = String(value || "");
  if (!raw) return "(empty)";
  const at = raw.indexOf("@");
  if (at <= 1) return `${raw.slice(0, 1)}***`;
  return `${raw.slice(0, 2)}***${raw.slice(at)}`;
}

/**
 * Login via API; returns Playwright-compatible cookies (no secrets logged).
 */
export async function loginAdminSession(baseUrl) {
  const { adminEmail, adminPass, hasAdminCredentials } = loadRuntimeCredentials();
  if (!hasAdminCredentials) {
    throw new Error(
      "Admin runtime auth requires E2E_ADMIN_EMAIL and E2E_ADMIN_PASS in .env.e2e.local",
    );
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "HasanChart-DS-Runtime/1.0",
    },
    body: JSON.stringify({ email: adminEmail, password: adminPass }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status !== 200 || !data?.success) {
    throw new Error(`Admin login failed: HTTP ${res.status}`);
  }

  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const url = new URL(baseUrl);
  const cookies = setCookies
    .map((raw) => {
      const parts = raw.split(";").map((p) => p.trim());
      const [nameValue] = parts;
      const eq = nameValue.indexOf("=");
      if (eq <= 0) return null;
      const name = nameValue.slice(0, eq);
      const value = nameValue.slice(eq + 1);
      const cookie = {
        name,
        value,
        domain: url.hostname,
        path: "/",
        httpOnly: /httponly/i.test(raw),
        secure: url.protocol === "https:",
        sameSite: /samesite=strict/i.test(raw)
          ? "Strict"
          : /samesite=none/i.test(raw)
            ? "None"
            : "Lax",
      };
      return cookie;
    })
    .filter(Boolean);

  const sessionRes = await fetch(`${baseUrl.replace(/\/$/, "")}/api/auth/session`, {
    headers: {
      Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "User-Agent": "HasanChart-DS-Runtime/1.0",
    },
  });
  const session = await sessionRes.json().catch(() => ({}));
  const authenticated = Boolean(session?.user?.id || session?.session?.user?.id);
  const isAdmin =
    session?.user?.role === "admin" ||
    session?.session?.user?.role === "admin" ||
    Boolean(session?.user?.isAdmin);

  return {
    cookies,
    authenticated,
    isAdmin,
    maskedEmail: maskIdentifier(adminEmail),
    userId: String(session?.user?.id || session?.session?.user?.id || "").slice(0, 8),
  };
}
