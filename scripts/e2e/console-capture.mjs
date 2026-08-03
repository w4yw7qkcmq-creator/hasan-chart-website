import fs from "node:fs";

/**
 * Captures browser console + network failures for HTML/JSON reports.
 */
export class ConsoleCapture {
  constructor(logFiles) {
    this.logFiles = logFiles;
    this.entries = [];
    this.networkFailures = [];
    this.unhandledRejections = [];
  }

  attach(page) {
    page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        this.record("console", { level: type, text: msg.text() });
      }
    });

    page.on("pageerror", (error) => {
      this.record("pageerror", { message: error?.message || String(error) });
    });

    page.on("requestfailed", (request) => {
      const failure = request.failure();
      this.networkFailures.push({
        url: request.url(),
        method: request.method(),
        error: failure?.errorText || "failed",
      });
      this.record("network", {
        url: request.url(),
        method: request.method(),
        error: failure?.errorText || "failed",
      });
    });
  }

  record(kind, payload) {
    const entry = { ts: new Date().toISOString(), kind, ...payload };
    this.entries.push(entry);
    if (this.logFiles?.consoleLog) {
      fs.appendFileSync(this.logFiles.consoleLog, `${JSON.stringify(entry)}\n`);
    }
  }

  recordNetworkBatch(items) {
    for (const item of items) {
      this.networkFailures.push(item);
    }
    if (this.logFiles?.networkLog && items.length) {
      fs.appendFileSync(this.logFiles.networkLog, `${JSON.stringify({ ts: new Date().toISOString(), items })}\n`);
    }
  }

  summary() {
    const errors = this.entries.filter((e) => e.level === "error" || e.kind === "pageerror");
    const warnings = this.entries.filter((e) => e.level === "warning");
    return {
      consoleErrors: errors.length,
      consoleWarnings: warnings.length,
      networkFailures: this.networkFailures.length,
      unhandledRejections: this.unhandledRejections.length,
      entries: this.entries,
      networkFailuresList: this.networkFailures,
    };
  }
}
