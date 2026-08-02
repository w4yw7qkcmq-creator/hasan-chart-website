const COUNTRIES = {
  US: {
    id: "US",
    names: ["United States", "US", "USA", "America", "American"],
    aliases: ["u.s.", "u.s.a."],
    currency: "USD",
    flagHints: ["subtle American flag accent only", "never dominant flag composition"],
    architectureHints: ["Washington DC institutional architecture", "US financial district skyline"],
    marketHints: ["US Treasury market", "US equity market context", "US dollar context"],
    colorHints: ["deep navy", "institutional gold accents", "neutral professional palette"],
  },
  EUROZONE: {
    id: "EUROZONE",
    names: ["Eurozone", "Euro area", "Europe", "European Union"],
    aliases: ["eu", "euro-zone"],
    currency: "EUR",
    flagHints: ["subtle European identity accents only"],
    architectureHints: ["Frankfurt financial district", "modern European institutional architecture"],
    marketHints: ["euro bond market", "European equity market context"],
    colorHints: ["cool blue", "institutional silver accents"],
  },
  UK: {
    id: "UK",
    names: ["United Kingdom", "UK", "Britain", "British"],
    aliases: ["u.k.", "great britain"],
    currency: "GBP",
    flagHints: ["subtle UK identity accents only"],
    architectureHints: ["City of London financial architecture", "historic central bank building"],
    marketHints: ["UK gilt market", "British pound context"],
    colorHints: ["deep blue", "institutional stone tones"],
  },
  JP: {
    id: "JP",
    names: ["Japan", "Japanese"],
    aliases: ["jp"],
    currency: "JPY",
    flagHints: ["subtle Japanese identity accents only"],
    architectureHints: ["Tokyo financial district", "Japanese institutional architecture"],
    marketHints: ["JGB market", "Japanese yen context"],
    colorHints: ["neutral gray-blue", "clean institutional lighting"],
  },
};

module.exports = { COUNTRIES };
