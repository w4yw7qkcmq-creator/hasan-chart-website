#!/usr/bin/env node

const path = require("path");

process.env.NEWS_DRY_RUN = "1";
process.env.NEWS_WORKER_NO_BOOT = "1";

process.chdir(path.join(__dirname, "..", "worker"));
require(path.join(__dirname, "..", "worker", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", ".env.local"),
});
require(path.join(__dirname, "..", "worker", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "worker", ".env"),
});

const { runEconomicReleaseDryRun } = require(path.join(__dirname, "..", "worker", "lib", "economic-releases"));

runEconomicReleaseDryRun({ limit: 50 })
  .then((report) => {
    console.log("ECONOMIC_RELEASES_DRY_RUN");
    console.log(JSON.stringify(report, null, 2));

    const forbiddenHits = report.rows.filter((row) => {
      const values = [row.Previous, row.Forecast, row.Actual].filter(Boolean).join(" ");
      return /غير\s*متوفر|N\/A|null|undefined/i.test(values);
    });

    if (forbiddenHits.length) {
      console.error("FORBIDDEN_PLACEHOLDER_FOUND", forbiddenHits.length);
      process.exit(2);
    }

    process.exit(report.complete > 0 ? 0 : 3);
  })
  .catch((error) => {
    console.error("ECONOMIC_RELEASES_DRY_RUN_FAILED", error.message);
    process.exit(1);
  });
