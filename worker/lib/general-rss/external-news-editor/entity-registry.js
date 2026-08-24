const FED_CHAIR_ID = "KEVIN_WARSH";

const OFFICIALS = Object.freeze([
  {
    id: "KEVIN_WARSH",
    canonicalName: "Kevin Warsh",
    names: ["Kevin Warsh", "Warsh"],
    arabicNames: ["كيفن وارش", "وارش", "Kevin Warsh"],
    institution: "FEDERAL_RESERVE",
    role: "Federal Reserve Chair",
    arabicRole: "رئيس الاحتياطي الفيدرالي",
    regionalBank: null,
    chairStatus: true,
    lastVerifiedAsOf: "2026-01-01",
  },
  {
    id: "NEEL_KASHKARI",
    canonicalName: "Neel Kashkari",
    names: ["Neel Kashkari", "Kashkari"],
    arabicNames: ["نيل كاشكاري", "كاشkari", "كاشكاري"],
    institution: "FEDERAL_RESERVE",
    role: "Minneapolis Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في مينيابوليس",
    regionalBank: "Minneapolis Fed",
    chairStatus: false,
    lastVerifiedAsOf: "2026-01-01",
  },
  {
    id: "JOHN_WILLIAMS",
    canonicalName: "John Williams",
    names: ["John Williams", "Williams"],
    arabicNames: ["جون ويليامز", "ويليامز"],
    institution: "FEDERAL_RESERVE",
    role: "New York Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في نيويورك",
    regionalBank: "New York Fed",
    chairStatus: false,
  },
  {
    id: "CHRISTOPHER_WALLER",
    canonicalName: "Christopher Waller",
    names: ["Christopher Waller", "Waller"],
    arabicNames: ["كريستوفر والر", "والر"],
    institution: "FEDERAL_RESERVE",
    role: "Federal Reserve Governor",
    arabicRole: "عضو مجلس الاحتياطي الفيدرالي",
    chairStatus: false,
  },
  {
    id: "MICHELLE_BOWMAN",
    canonicalName: "Michelle Bowman",
    names: ["Michelle Bowman", "Bowman"],
    arabicNames: ["ميشيل باومان", "باومان"],
    institution: "FEDERAL_RESERVE",
    role: "Federal Reserve Governor",
    arabicRole: "عضو مجلس الاحتياطي الفيدرالي",
    chairStatus: false,
  },
  {
    id: "PHILIP_JEFFERSON",
    canonicalName: "Philip Jefferson",
    names: ["Philip Jefferson", "Jefferson"],
    arabicNames: ["فيليب جيفرسون", "جيفرسون"],
    institution: "FEDERAL_RESERVE",
    role: "Federal Reserve Vice Chair",
    arabicRole: "نائب رئيس الاحتياطي الفيدرالي",
    chairStatus: false,
  },
  {
    id: "LISA_COOK",
    canonicalName: "Lisa Cook",
    names: ["Lisa Cook", "Cook"],
    arabicNames: ["ليزا كوك", "كوك"],
    institution: "FEDERAL_RESERVE",
    role: "Federal Reserve Governor",
    arabicRole: "عضو مجلس الاحتياطي الفيدرالي",
    chairStatus: false,
  },
  {
    id: "AUSTAN_GOOLSBEE",
    canonicalName: "Austan Goolsbee",
    names: ["Austan Goolsbee", "Goolsbee"],
    arabicNames: ["أوستن جولزبي", "جولزبي"],
    institution: "FEDERAL_RESERVE",
    role: "Chicago Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في شيكاغو",
    regionalBank: "Chicago Fed",
    chairStatus: false,
  },
  {
    id: "MARY_DALY",
    canonicalName: "Mary Daly",
    names: ["Mary Daly", "Daly"],
    arabicNames: ["ماري دالي", "دالي"],
    institution: "FEDERAL_RESERVE",
    role: "San Francisco Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في سان فرancisco",
    regionalBank: "San Francisco Fed",
    chairStatus: false,
  },
  {
    id: "RAPHAEL_BOSTIC",
    canonicalName: "Raphael Bostic",
    names: ["Raphael Bostic", "Bostic"],
    arabicNames: ["رافael بوستيك", "بوستيك"],
    institution: "FEDERAL_RESERVE",
    role: "Atlanta Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في أtlanta",
    regionalBank: "Atlanta Fed",
    chairStatus: false,
  },
  {
    id: "LORIE_LOGAN",
    canonicalName: "Lorie Logan",
    names: ["Lorie Logan", "Logan"],
    arabicNames: ["لوري لوجan", "لوجan"],
    institution: "FEDERAL_RESERVE",
    role: "Dallas Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في دallas",
    regionalBank: "Dallas Fed",
    chairStatus: false,
  },
  {
    id: "BETH_HAMMACK",
    canonicalName: "Beth Hammack",
    names: ["Beth Hammack", "Hammack"],
    arabicNames: ["بeth همack", "همack"],
    institution: "FEDERAL_RESERVE",
    role: "Cleveland Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في كليفland",
    regionalBank: "Cleveland Fed",
    chairStatus: false,
  },
  {
    id: "SUSAN_COLLINS",
    canonicalName: "Susan Collins",
    names: ["Susan Collins", "Collins"],
    arabicNames: ["سوzan كollins", "كollins"],
    institution: "FEDERAL_RESERVE",
    role: "Boston Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في boston",
    regionalBank: "Boston Fed",
    chairStatus: false,
  },
  {
    id: "ALBERTO_MUSALEM",
    canonicalName: "Alberto Musalem",
    names: ["Alberto Musalem", "Musalem"],
    arabicNames: ["أlberto musalem", "musalem"],
    institution: "FEDERAL_RESERVE",
    role: "St. Louis Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في st louis",
    regionalBank: "St. Louis Fed",
    chairStatus: false,
  },
  {
    id: "TOM_BARKIN",
    canonicalName: "Tom Barkin",
    names: ["Tom Barkin", "Barkin"],
    arabicNames: ["تom barkin", "barkin"],
    institution: "FEDERAL_RESERVE",
    role: "Richmond Fed President",
    arabicRole: "رئيس بنك الاحتياطي الفيدرالي في richmond",
    regionalBank: "Richmond Fed",
    chairStatus: false,
  },
]);

function normalizeLookup(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\u0600-\u06ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchOfficialInText(text = "") {
  const normalized = normalizeLookup(text);
  const matches = [];
  for (const official of OFFICIALS) {
    const needles = [...official.names, ...official.arabicNames, official.canonicalName];
    if (needles.some((needle) => normalized.includes(normalizeLookup(needle)))) {
      matches.push(official);
    }
  }
  return matches;
}

function getFedChairOfficial() {
  return OFFICIALS.find((official) => official.chairStatus) || OFFICIALS.find((o) => o.id === FED_CHAIR_ID);
}

function resolveOfficialRolePhrase(official, preferSourceRole = null) {
  if (!official) return null;
  if (preferSourceRole && normalizeLookup(preferSourceRole).includes("president")) {
    return official.arabicRole;
  }
  if (official.chairStatus) return official.arabicRole;
  return official.arabicRole;
}

function isFedChairTitlePhrase(text = "") {
  const normalized = normalizeLookup(text);
  return (
    /رئيس الاحتياطي الفيدرالي/.test(text) ||
    /fed chair|federal reserve chair|chair of the federal reserve/.test(normalized)
  );
}

module.exports = {
  FED_CHAIR_ID,
  OFFICIALS,
  normalizeLookup,
  matchOfficialInText,
  getFedChairOfficial,
  resolveOfficialRolePhrase,
  isFedChairTitlePhrase,
};
