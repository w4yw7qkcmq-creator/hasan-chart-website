const assert = require("assert");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const {
  guardFedOfficeholderRoles,
  applyFedOfficeholderGuardToMessage,
  applyRssOfficeholderGuardsToMessage,
} = require(path.join(root, "lib/general-rss/fed-officeholder-role-guard"));
const { extractRoleFromSourceText } = require(path.join(root, "lib/general-rss/external-news-editor/structured-facts"));
const { getOfficialById, FED_CHAIR_ID, JEROME_POWELL_ID } = require(path.join(
  root,
  "lib/general-rss/external-news-editor/entity-registry"
));

const WARSH = getOfficialById(FED_CHAIR_ID);
const POWELL = getOfficialById(JEROME_POWELL_ID);

function testCurrentWarshFormerArabicRemoved() {
  const arabic = "قال رئيس الاحتياطي الفيدرالي السابق كيفن وارش اليوم إن الفائدة قد تبقى مرتفعة.";
  const source = "Fed Chair Kevin Warsh said today rates may stay higher.";
  const result = guardFedOfficeholderRoles({ arabicText: arabic, sourceText: source });
  assert.equal(result.changed, true);
  assert.match(result.text, /رئيس الاحتياطي الفيدرالي كيفن وارش/u);
  assert.doesNotMatch(result.text, /السابق\s+كيفن/u);
}

function testCurrentPowellFormerArabicFixed() {
  const arabic = "قال رئيس الاحتياطي الفيدرالي جيروم باول اليوم إن التضخم يتراجع.";
  const source = "Former Fed Chair Jerome Powell said today inflation is easing.";
  const result = guardFedOfficeholderRoles({ arabicText: arabic, sourceText: source });
  assert.equal(result.changed, true);
  assert.match(result.text, /الرئيس السابق للاحتياطي الفيدرالي جيروم باول/u);
  assert.doesNotMatch(result.text, /^قال رئيس الاحتياطي الفيدرالي جيروم/u);
}

function testHistoricalPowellChairPreserved() {
  const arabic = "في 2024، قال رئيس الاحتياطي الفيدرالي جيروم باول إن السياسة ستبقى restrictive.";
  const source = "In 2024, Fed Chair Jerome Powell said policy would stay restrictive.";
  const result = guardFedOfficeholderRoles({ arabicText: arabic, sourceText: source });
  assert.equal(result.changed, false);
  assert.match(result.text, /رئيس الاحتياطي الفيدرالي جيروم باول/u);
}

function testHistoricalWarshNotUpgradedToChair() {
  const source = "Former Fed Governor Kevin Warsh said in 2010 that inflation risk was limited.";
  const role = extractRoleFromSourceText(source, WARSH);
  assert.equal(role, "Former Federal Reserve Governor");
}

function testKashkariNoRegression() {
  const arabic = "قال رئيس بنك الاحتياطي الفيدرالي في مينيابوليس نيل كاشkari إن التضخم قد يتراجع.";
  const source = "Minneapolis Fed President Neel Kashkari said inflation may ease.";
  const result = guardFedOfficeholderRoles({ arabicText: arabic, sourceText: source });
  assert.equal(result.changed, false);
  assert.equal(result.text, arabic);
}

function testViceChairUnchanged() {
  const arabic = "قال نائب رئيس الاحتياطي الفيدرالي فيليب جيفرسون إن البيانات قوية.";
  const source = "Federal Reserve Vice Chair Philip Jefferson said data remain strong.";
  const result = guardFedOfficeholderRoles({ arabicText: arabic, sourceText: source });
  assert.equal(result.changed, false);
}

function testNoFedPersonUnchanged() {
  const arabic = "ارتفع الذهب بعد بيانات التضخم الأمريكية.";
  const source = "Gold rises after US inflation data.";
  const before = arabic;
  const result = guardFedOfficeholderRoles({ arabicText: arabic, sourceText: source });
  assert.equal(result.changed, false);
  assert.equal(result.text, before);
}

function testEconomicPreviousLineUnchanged() {
  const arabic = "إصدار اقتصادي\nالسابق: 209K\nالمتوقع: 210K\nالحالي: 206K";
  const result = guardFedOfficeholderRoles({
    arabicText: arabic,
    sourceText: "US Jobless Claims Previous 209K Actual 206K",
  });
  assert.equal(result.changed, false);
  assert.match(result.text, /209K/);
}

function testQuotationNotModified() {
  const arabic = 'نقلت الوكالة عنه قوله: «رئيس الاحتياطي الفيدرالي السابق كيفن وارش مهم»';
  const source = "Fed Chair Kevin Warsh said today rates are steady.";
  const result = guardFedOfficeholderRoles({ arabicText: arabic, sourceText: source });
  assert.equal(result.changed, false);
  assert.match(result.text, /«رئيس الاحتياطي الفيدرالي السابق كيفن وارش/u);
}

function testTrumpThenFedSequential() {
  const arabic = "قال رئيس الاحتياطي الفيدرالي السابق كيفن وارش اليوم.";
  const source = "Fed Chair Kevin Warsh said today.";
  const result = applyRssOfficeholderGuardsToMessage(arabic, source);
  assert.equal(result.changed, true);
  assert.match(result.text, /رئيس الاحتياطي الفيدرالي كيفن وارش/u);
}

function testPipelineWiring() {
  const editorV2Index = fs.readFileSync(path.join(root, "lib/general-rss/editor-v2/index.js"), "utf8");
  const newsWorker = fs.readFileSync(path.join(root, "news-worker.js"), "utf8");
  assert.match(editorV2Index, /applyFedOfficeholderGuardToEditorial/u);
  assert.match(newsWorker, /applyFedOfficeholderGuardToMessage/u);
  assert.match(newsWorker, /prePublishFedGuard/u);
}

function testExtractRolePowellFormerFromSource() {
  const source = "Former Fed Chair Jerome Powell commented on inflation.";
  const role = extractRoleFromSourceText(source, POWELL);
  assert.equal(role, "Former Federal Reserve Chair");
}

function run() {
  testCurrentWarshFormerArabicRemoved();
  testCurrentPowellFormerArabicFixed();
  testHistoricalPowellChairPreserved();
  testHistoricalWarshNotUpgradedToChair();
  testKashkariNoRegression();
  testViceChairUnchanged();
  testNoFedPersonUnchanged();
  testEconomicPreviousLineUnchanged();
  testQuotationNotModified();
  testTrumpThenFedSequential();
  testPipelineWiring();
  testExtractRolePowellFormerFromSource();
  console.log("fed-officeholder-role-guard tests passed");
}

run();
