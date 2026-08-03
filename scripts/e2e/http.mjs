export class CookieJar {
  constructor() {
    /** @type {Map<string, string>} */
    this.map = new Map();
  }

  ingest(response) {
    const raw =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    for (const cookie of raw) {
      const [pair] = cookie.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) {
        this.map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }
  }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  clear() {
    this.map.clear();
  }
}

export class HttpClient {
  /**
   * @param {string} baseUrl
   * @param {CookieJar} [jar]
   */
  constructor(baseUrl, jar = new CookieJar()) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.jar = jar;
  }

  async fetch(path, { method = "GET", body, headers = {}, timeoutMs = 30_000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body != null ? { "Content-Type": "application/json" } : {}),
          Cookie: this.jar.header(),
          "User-Agent": "HasanChart-E2E-Smoke/1.0",
          ...headers,
        },
        body: body != null ? JSON.stringify(body) : undefined,
        redirect: "manual",
        signal: controller.signal,
      });
      this.jar.ingest(res);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async json(path, options = {}) {
    const res = await this.fetch(path, options);
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text.slice(0, 400) };
    }
    return { res, data, text };
  }

  async login(email, password) {
    const { res, data } = await this.json("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    if (res.status !== 200 || !data?.success) {
      throw new Error(`login failed: ${res.status} ${data?.error || "unknown"}`);
    }
    return data.user;
  }

  async logout() {
    return this.json("/api/auth/logout", { method: "POST" });
  }

  async session() {
    return this.json("/api/auth/session");
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
