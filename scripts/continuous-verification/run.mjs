#!/usr/bin/env node
/**
 * CV CLI — supports dry-run by default via CV_DRY_RUN=1
 */
import { loadCvEnv } from "./env.mjs";
import { runCheckpoint, runCv } from "./runner.mjs";

const args = process.argv.slice(2);
const env = loadCvEnv();

if (args.includes("--live")) {
  env.dryRun = false;
} else if (!process.env.CV_LIVE) {
  env.dryRun = true;
}

const idArg = args.find((a) => a.startsWith("--id="));
const checkpointId = idArg ? idArg.split("=")[1] : null;
const mode = process.env.CV_MODE || (checkpointId ? "checkpoint" : "run");

(async () => {
  if (mode === "checkpoint" && checkpointId) {
    const result = await runCheckpoint(checkpointId, { env, dryRun: env.dryRun });
    console.log(`Checkpoint ${checkpointId}: ${result.verdict}`);
    process.exit(result.verdict === "UNHEALTHY" ? 1 : 0);
  }

  const payload = await runCv({
    env,
    dryRun: env.dryRun,
    singleCheckpoint: checkpointId,
    checkpointIds: checkpointId ? [checkpointId] : env.dryRun ? [] : undefined,
    fullSequence: false,
  });
  console.log(`Continuous Verification: ${payload.finalVerdict} (dryRun=${payload.dryRun})`);
  process.exit(payload.finalVerdict === "UNHEALTHY" ? 1 : 0);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
