const assert = require("assert");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const {
  guardTrumpCurrentRole,
  applyTrumpOfficeholderGuardToMessage,
  DONALD_TRUMP,
  TRUMP,
} = require(path.join(root, "lib/general-rss/trump-officeholder-role-guard"));

const US_PRES = "\u0627\u0644\u0631\u0626\u064A\u0633 \u0627\u0644\u0623\u0645\u0631\u064A\u0643\u064A";
const FORMER_US_PRES = `${US_PRES} \u0627\u0644\u0633\u0627\u0628\u0642`;

function testCaseA() {
  const input = `\u0623\u0641\u0627\u062F\u062A \u0623\u0646\u0628\u0627\u0621 \u0623\u0646 ${FORMER_US_PRES} ${DONALD_TRUMP} \u0637\u0644\u0628...`;
  const result = guardTrumpCurrentRole({ arabicText: input, sourceText: "Trump asked Zelensky today" });
  assert.equal(result.changed, true);
  assert.match(result.text, new RegExp(`${US_PRES} ${DONALD_TRUMP}`));
  assert.doesNotMatch(result.text, /\u0627\u0644\u0633\u0627\u0628\u0642/u);
}

function testCaseB() {
  const input = `${FORMER_US_PRES} ${TRUMP} \u0642\u0627\u0644 \u0627\u0644\u064A\u0648\u0645...`;
  const result = guardTrumpCurrentRole({ arabicText: input, sourceText: "" });
  assert.equal(result.changed, true);
  assert.match(result.text, new RegExp(`${US_PRES} ${TRUMP}`));
}

function testCaseC() {
  const input = `\u062E\u0644\u0627\u0644 \u0631\u0626\u0627\u0633\u062A\u0647 \u0627\u0644\u0633\u0627\u0628\u0642\u0629\u060C \u0627\u062A\u062E\u0630 ${TRUMP} \u0642\u0631\u0627\u0631\u0627\u064B...`;
  const result = guardTrumpCurrentRole({ arabicText: input, sourceText: "" });
  assert.equal(result.changed, false);
  assert.equal(result.text, input);
}

function testCaseD() {
  const input = `\u0639\u0646\u062F\u0645\u0627 \u0643\u0627\u0646 ${TRUMP} \u0631\u0626\u064A\u0633\u0627\u064B \u0641\u064A \u0639\u0627\u0645 2020\u060C ${FORMER_US_PRES} ${TRUMP} \u0642\u0627\u0644...`;
  const result = guardTrumpCurrentRole({ arabicText: input, sourceText: "" });
  assert.equal(result.changed, false);
  assert.match(result.text, /\u0627\u0644\u0633\u0627\u0628\u0642/u);
}

function testCaseE() {
  const input = "\u0627\u0631\u062A\u0641\u0639 \u0627\u0644\u0630\u0647\u0628 \u0628\u0639\u062F \u0628\u064A\u0627\u0646 \u0627\u0644\u0641\u064A\u062F\u0631\u0627\u0644\u064A";
  const result = guardTrumpCurrentRole({ arabicText: input, sourceText: "Gold rises after Fed statement" });
  assert.equal(result.changed, false);
  assert.equal(result.text, input);
}

function testCaseF() {
  const input =
    "\u0625\u0635\u062F\u0627\u0631 \u0627\u0642\u062A\u0635\u0627\u062F\u064A\n\u0627\u0644\u0633\u0627\u0628\u0642: 209K\n\u0627\u0644\u0645\u062A\u0648\u0642\u0639: 210K\n\u0627\u0644\u062D\u0627\u0644\u064A: 206K";
  const result = guardTrumpCurrentRole({
    arabicText: input,
    sourceText: "US Jobless Claims Previous 209K Actual 206K",
  });
  assert.equal(result.changed, false);
  assert.match(result.text, /209K/);
  assert.match(result.text, /206K/);
}

function testSourceFormerPresidentStillRepairedInCurrentNews() {
  const input = `${FORMER_US_PRES} ${TRUMP} \u0648\u0641\u0642 \u0645\u0635\u0627\u062F\u0631 \u0637\u0644\u0628 \u0627\u062C\u062A\u0645\u0627\u0639\u0627\u064B \u0639\u0627\u062C\u0644\u0627\u064B.`;
  const result = guardTrumpCurrentRole({
    arabicText: input,
    sourceText: "Former President Trump asked for a meeting today, sources say",
  });
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.text, /\u0627\u0644\u0631\u0626\u064A\u0633 \u0627\u0644\u0623\u0645\u0631\u064A\u0643\u064A \u0627\u0644\u0633\u0627\u0628\u0642/u);
}

function testPipelineWiring() {
  const editorV2Index = fs.readFileSync(path.join(root, "lib/general-rss/editor-v2/index.js"), "utf8");
  const newsWorker = fs.readFileSync(path.join(root, "news-worker.js"), "utf8");
  assert.match(editorV2Index, /applyTrumpOfficeholderGuardToEditorial/u);
  assert.match(newsWorker, /applyTrumpOfficeholderGuardToMessage/u);
  assert.match(newsWorker, /prePublishTrumpGuard/u);
}

function run() {
  testCaseA();
  testCaseB();
  testCaseC();
  testCaseD();
  testCaseE();
  testCaseF();
  testSourceFormerPresidentStillRepairedInCurrentNews();
  testPipelineWiring();
  console.log("trump-officeholder-role-guard tests passed");
}

run();
