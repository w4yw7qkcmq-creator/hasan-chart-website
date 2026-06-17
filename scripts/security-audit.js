

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const TARGET_DIRS = ["app", "lib", "utils", "worker", "scripts"];
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".vercel",
  "node_modules",
  "public",
  "dist",
  "build",
]);

const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

const findings = [];

function addFinding({ severity, file, line, title, details, recommendation }) {
  findings.push({ severity, file, line, title, details, recommendation });
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    const ext = path.extname(entry.name);
    if (EXTENSIONS.has(ext)) files.push(fullPath);
  }

  return files;
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function getLine(content, index) {
  return content.slice(0, index).split("\n").length;
}

function scanFile(file) {
  const relative = rel(file);
  const content = fs.readFileSync(file, "utf8");
  const isApiRoute = /app\/api\/.*\/route\.(js|ts)$/.test(relative);
  const isAdminRoute = /app\/api\/admin\//.test(relative);
  const isPage = /app\/.*page\.(js|jsx|ts|tsx)$/.test(relative);

  const checks = [
    {
      severity: "CRITICAL",
      title: "Hardcoded private token or secret",
      regex: /(sk-[A-Za-z0-9_-]{20,}|SUPABASE_SERVICE_ROLE_KEY\s*=|service_role\s*[:=]\s*["'`][A-Za-z0-9._-]{20,})/g,
      details: "Possible private key/token is hardcoded in source code.",
      recommendation: "Move secrets to Railway/Supabase environment variables. Never commit real secrets to GitHub.",
    },
    {
      severity: "HIGH",
      title: "Service role usage",
      regex: /service_role|SUPABASE_SERVICE_ROLE_KEY|supabaseServiceRole|SERVICE_ROLE/g,
      details: "Supabase service role can bypass RLS and must only be used server-side in protected admin routes.",
      recommendation: "Verify this file never runs in the browser and the route checks admin permission before any database action.",
    },
    {
      severity: "HIGH",
      title: "Sensitive data selected with select('*')",
      regex: /\.select\(\s*["'`]\*["]?`?\s*\)/g,
      details: "select('*') may expose sensitive columns like api_key, secret_key, tokens, email, or internal fields.",
      recommendation: "Select only the exact columns needed for this page/API response.",
    },
    {
      severity: "MEDIUM",
      title: "Console logging may expose data",
      regex: /console\.(log|error|warn)\(/g,
      details: "Logs can accidentally expose user data, request bodies, API keys, or tokens in Railway logs.",
      recommendation: "Log only safe summaries, IDs, counts, and sanitized errors. Never log keys/secrets/full request bodies.",
    },
    {
      severity: "MEDIUM",
      title: "localStorage/sessionStorage usage",
      regex: /(localStorage|sessionStorage)\./g,
      details: "Browser storage is readable by JavaScript and unsafe for sensitive tokens.",
      recommendation: "Use HttpOnly cookies for auth tokens. Do not store access/refresh tokens in localStorage.",
    },
    {
      severity: "MEDIUM",
      title: "Cookie set without obvious security flags",
      regex: /Set-Cookie|cookies\(\)\.set|response\.cookies\.set/g,
      details: "Cookies should be HttpOnly, Secure, SameSite, and have a reasonable path/maxAge.",
      recommendation: "Ensure auth cookies use httpOnly: true, secure: true in production, sameSite: 'lax' or 'strict'.",
    },
    {
      severity: "LOW",
      title: "Potential user input used directly",
      regex: /request\.json\(|searchParams\.get\(|req\.body|formData\(/g,
      details: "User input should be validated and length-limited before database/API usage.",
      recommendation: "Validate type, length, allowed values, and reject unknown fields.",
    },
  ];

  for (const check of checks) {
    for (const match of content.matchAll(check.regex)) {
      addFinding({
        severity: check.severity,
        file: relative,
        line: getLine(content, match.index),
        title: check.title,
        details: check.details,
        recommendation: check.recommendation,
      });
    }
  }

  if (isApiRoute) {
    const hasAuthCheck =
      /hc_access_token|hc_refresh_token|getUserFromRequest|verify|jwt|authorization|cookies\(\)/i.test(content);
    const hasRateLimit = /rateLimit|rateLimiter|too many|429|RATE_LIMIT/i.test(content);

    if (!hasAuthCheck && !/app\/api\/(auth|news|prices|health)/.test(relative)) {
      addFinding({
        severity: "HIGH",
        file: relative,
        line: 1,
        title: "API route may be missing authentication",
        details: "This API route does not show an obvious auth/cookie/JWT check.",
        recommendation: "Add authentication before reading or writing user data.",
      });
    }

    if (!hasRateLimit && !/app\/api\/(news|prices|health|admin\/dashboard)/.test(relative)) {
      addFinding({
        severity: "MEDIUM",
        file: relative,
        line: 1,
        title: "API route may be missing rate limiting",
        details: "Public or user-facing API routes can be abused without rate limiting.",
        recommendation: "Add IP/user based rate limiting, especially for login, analysis requests, alerts, and account management.",
      });
    }
  }

  if (isAdminRoute) {
    const hasAdminCheck = /admin|ADMIN_EMAIL|isAdmin|role\s*===\s*["'`]admin["'`]|allowedAdmins/i.test(content);

    if (!hasAdminCheck) {
      addFinding({
        severity: "CRITICAL",
        file: relative,
        line: 1,
        title: "Admin API route may be missing admin authorization",
        details: "Admin routes must verify the current user is an admin before returning or changing data.",
        recommendation: "Check the authenticated email/role against a server-side admin allowlist before all admin actions.",
      });
    }
  }

  if (isPage && /api[_-]?key|secret[_-]?key|private[_-]?key/i.test(content)) {
    addFinding({
      severity: "HIGH",
      file: relative,
      line: 1,
      title: "Sensitive key wording found in page component",
      details: "A page component may render or handle sensitive key material.",
      recommendation: "Only show masked values by default and reveal secrets only to verified admins through protected APIs.",
    });
  }
}

function severityRank(severity) {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[severity] ?? 4;
}

function printReport() {
  findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const counts = findings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});

  console.log("\n==============================");
  console.log("Hasan Chart Security Audit");
  console.log("==============================\n");

  console.log("Summary:");
  console.log(`- CRITICAL: ${counts.CRITICAL || 0}`);
  console.log(`- HIGH:     ${counts.HIGH || 0}`);
  console.log(`- MEDIUM:   ${counts.MEDIUM || 0}`);
  console.log(`- LOW:      ${counts.LOW || 0}`);
  console.log(`- TOTAL:    ${findings.length}\n`);

  if (!findings.length) {
    console.log("No obvious issues found by this static scan. Manual review is still recommended.\n");
    return;
  }

  for (const item of findings) {
    console.log(`[${item.severity}] ${item.title}`);
    console.log(`File: ${item.file}:${item.line}`);
    console.log(`Details: ${item.details}`);
    console.log(`Fix: ${item.recommendation}`);
    console.log("---");
  }

  const outDir = path.join(ROOT, "security-reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const reportPath = path.join(outDir, `security-audit-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), counts, findings }, null, 2));

  console.log(`\nJSON report saved to: ${rel(reportPath)}\n`);
}

function main() {
  const files = TARGET_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));

  for (const file of files) {
    scanFile(file);
  }

  printReport();
}

main();