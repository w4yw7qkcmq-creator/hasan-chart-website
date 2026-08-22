const fs = require("fs");
const path = require("path");

function resolveEmailOutboxCoreModule() {
  const candidates = [
    path.join(__dirname, "lib", "email-outbox-core.cjs"),
    path.join(__dirname, "..", "lib", "email-outbox-core.cjs"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("email-outbox-core.cjs not found for email-outbox-processor");
}

module.exports = require(resolveEmailOutboxCoreModule());
