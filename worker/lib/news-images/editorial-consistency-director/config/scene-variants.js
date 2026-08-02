const SCENE_VARIANTS = {
  CPI: [
    {
      id: "shopper-price-check",
      heroSubject: "single shopper comparing prices on a supermarket shelf in a real American store aisle",
      visualStory: "A shopper quietly compares prices before deciding what to buy.",
      momentBefore: "The shopper pauses and checks a price tag.",
      momentAfter: "The shopper continues down the aisle naturally.",
    },
    {
      id: "restock-aisle",
      heroSubject: "store employee restocking packaged goods on a supermarket shelf during normal business hours",
      visualStory: "Routine shelf restocking reflects everyday retail price pressure.",
      momentBefore: "The employee aligns products on the shelf.",
      momentAfter: "The aisle returns to normal shopper flow.",
    },
    {
      id: "checkout-line",
      heroSubject: "natural checkout line inside an American supermarket with one shopper waiting calmly",
      visualStory: "Ordinary checkout activity captures consumer spending mood.",
      momentBefore: "A shopper approaches the checkout queue.",
      momentAfter: "The line moves forward naturally.",
    },
    {
      id: "family-shopping",
      heroSubject: "single family shopping together in one supermarket aisle with natural body language",
      visualStory: "A family makes routine shopping choices in a real store.",
      momentBefore: "The family slows down to compare options.",
      momentAfter: "They continue shopping without posing.",
    },
    {
      id: "produce-section",
      heroSubject: "fresh produce section in an American supermarket with one shopper choosing vegetables",
      visualStory: "Fresh food choices reflect everyday inflation sensitivity.",
      momentBefore: "The shopper inspects produce on display.",
      momentAfter: "The shopper places an item in the basket naturally.",
    },
  ],
  NFP: [
    {
      id: "interview-arrival",
      heroSubject: "job candidate arriving for an interview in a normal American office reception area",
      visualStory: "A candidate arrives for a hiring conversation.",
      momentBefore: "The candidate checks in at reception.",
      momentAfter: "The interview process continues naturally.",
    },
    {
      id: "office-floor",
      heroSubject: "office workers moving through a real workplace floor during a normal business day",
      visualStory: "Routine office activity reflects labor market motion.",
      momentBefore: "Employees pass through the workspace.",
      momentAfter: "Work continues without interruption.",
    },
    {
      id: "hiring-desk",
      heroSubject: "professional desk with laptop in a hiring or HR office environment",
      visualStory: "A hiring desk quietly signals employment decisions.",
      momentBefore: "A recruiter prepares for the next conversation.",
      momentAfter: "The workday continues naturally.",
    },
    {
      id: "warehouse-shift",
      heroSubject: "worker beginning a shift in a logistics or warehouse environment",
      visualStory: "Shift change activity reflects labor demand.",
      momentBefore: "The worker enters the work area.",
      momentAfter: "Operations continue normally.",
    },
    {
      id: "team-meeting",
      heroSubject: "small team meeting in a conference room with natural professional behavior",
      visualStory: "A workplace meeting captures employment stability or change.",
      momentBefore: "Colleagues gather around the table.",
      momentAfter: "The meeting proceeds naturally.",
    },
  ],
  FED_BUILDING: [
    {
      id: "facade-street",
      heroSubject: "Federal Reserve Eccles Building facade from street level as the sole architectural hero",
      visualStory: "Quiet institutional presence before a policy decision.",
      momentBefore: "The building stands in calm pre-release atmosphere.",
      momentAfter: "Official activity remains restrained.",
    },
    {
      id: "entrance-approach",
      heroSubject: "approach to the Federal Reserve entrance with official cars at a distance",
      visualStory: "Official arrival rhythm before the policy moment.",
      momentBefore: "Security and arrivals settle into place.",
      momentAfter: "The institution remains the visual anchor.",
    },
    {
      id: "facade-sky",
      heroSubject: "Federal Reserve facade with clean sky lines and no dramatic action",
      visualStory: "Architectural stillness conveys policy gravity.",
      momentBefore: "The scene holds a quiet pre-decision pause.",
      momentAfter: "The building remains unchanged and authoritative.",
    },
  ],
  FED_ROOM: [
    {
      id: "empty-table",
      heroSubject: "empty FOMC meeting table and chairs before officials enter",
      visualStory: "A hushed room waits for the policy decision.",
      momentBefore: "Chairs and table sit ready.",
      momentAfter: "The room remains the calm center of the moment.",
    },
    {
      id: "room-corner",
      heroSubject: "FOMC policy room seen from a rear corner with natural interior depth",
      visualStory: "Interior stillness before attention peaks.",
      momentBefore: "The room waits in professional silence.",
      momentAfter: "The policy setting remains unchanged.",
    },
    {
      id: "briefing-table",
      heroSubject: "official Federal Reserve policy room table setting without readable documents",
      visualStory: "Institutional readiness without drama.",
      momentBefore: "The table is prepared for decision time.",
      momentAfter: "The room stays measured and official.",
    },
  ],
  POWELL: [
    {
      id: "press-angle-left",
      heroSubject: "Jerome Powell at the Federal Reserve podium seen from the left press corps angle",
      visualStory: "Markets wait for Powell to speak.",
      momentBefore: "Powell prepares to answer.",
      momentAfter: "The briefing continues naturally.",
    },
    {
      id: "press-angle-right",
      heroSubject: "Jerome Powell at the Federal Reserve podium seen from the right press corps angle",
      visualStory: "A live central bank briefing captured from the working press pool.",
      momentBefore: "Powell listens to the next question.",
      momentAfter: "The press conference continues.",
    },
    {
      id: "press-rear",
      heroSubject: "Jerome Powell at podium with journalists visible from behind in foreground blur",
      visualStory: "The briefing as seen from within the press room.",
      momentBefore: "Journalists wait for the next response.",
      momentAfter: "The event continues without theatrics.",
    },
  ],
  ECB: [
    {
      id: "headquarters-front",
      heroSubject: "ECB headquarters in Frankfurt from a direct front architectural angle",
      visualStory: "Institutional calm before a euro-area policy decision.",
      momentBefore: "The headquarters holds a quiet pre-release atmosphere.",
      momentAfter: "The building remains the visual anchor.",
    },
    {
      id: "headquarters-angle",
      heroSubject: "ECB headquarters seen from a slight angle with Frankfurt context at distance",
      visualStory: "European central bank authority in a real urban setting.",
      momentBefore: "The scene remains professionally still.",
      momentAfter: "Institutional presence continues.",
    },
    {
      id: "plaza-approach",
      heroSubject: "approach to ECB headquarters plaza with restrained urban activity",
      visualStory: "A formal European central bank moment.",
      momentBefore: "The plaza settles into routine.",
      momentAfter: "The institution remains central to the frame.",
    },
  ],
  GDP: [
    {
      id: "port-containers",
      heroSubject: "active port with shipping containers and trucks showing ongoing economic movement",
      visualStory: "Commerce continues without celebration or failure.",
      momentBefore: "Logistics activity moves through the port.",
      momentAfter: "Operations continue naturally.",
    },
    {
      id: "truck-depot",
      heroSubject: "trucks loading or unloading at a logistics depot during normal operations",
      visualStory: "Transport activity reflects economic motion.",
      momentBefore: "Workers prepare the next movement of goods.",
      momentAfter: "The depot keeps operating.",
    },
    {
      id: "commerce-district",
      heroSubject: "urban commerce district activity with one clear economic movement hero",
      visualStory: "Everyday economic activity in a real city.",
      momentBefore: "Business traffic flows normally.",
      momentAfter: "The district remains active.",
    },
  ],
  PCE: [
    {
      id: "checkout-payment",
      heroSubject: "consumer payment moment at a retail checkout counter",
      visualStory: "An ordinary spending decision in a real store.",
      momentBefore: "The shopper prepares to pay.",
      momentAfter: "The transaction completes naturally.",
    },
    {
      id: "retail-browsing",
      heroSubject: "shopper browsing retail goods in a store aisle",
      visualStory: "Consumer spending mood without symbolic props.",
      momentBefore: "The shopper evaluates an item.",
      momentAfter: "Shopping continues naturally.",
    },
    {
      id: "shopping-bags",
      heroSubject: "consumer leaving a store with shopping bags from a natural distance",
      visualStory: "Routine consumption activity.",
      momentBefore: "The shopper finishes a purchase.",
      momentAfter: "They walk away naturally.",
    },
  ],
  ISM: [
    {
      id: "factory-floor",
      heroSubject: "active factory floor with machinery in use during normal production",
      visualStory: "Production continues on the factory floor.",
      momentBefore: "A machine cycle completes.",
      momentAfter: "Production keeps moving.",
    },
    {
      id: "assembly-line",
      heroSubject: "assembly line activity with one clear production hero zone",
      visualStory: "Manufacturing motion without market-room symbolism.",
      momentBefore: "Workers and machines continue the line.",
      momentAfter: "The line keeps running.",
    },
    {
      id: "machinery-detail",
      heroSubject: "industrial machinery in operation inside a real factory environment",
      visualStory: "Factory activity as a business-cycle signal.",
      momentBefore: "Equipment runs through a normal cycle.",
      momentAfter: "Production continues.",
    },
  ],
  SELLOFF: [
    {
      id: "trading-floor-reaction",
      heroSubject: "single trader monitoring market activity on a real institutional trading floor",
      visualStory: "A trader reacts to a broad equity sell-off in real time.",
      momentBefore: "Market activity intensifies on the floor.",
      momentAfter: "The trader continues monitoring without posing.",
    },
    {
      id: "institutional-desk-monitoring",
      heroSubject: "portfolio manager at an institutional desk reviewing market screens from natural distance",
      visualStory: "Institutional monitoring during a market drawdown.",
      momentBefore: "The manager reviews incoming market movement.",
      momentAfter: "Work continues with professional focus.",
    },
    {
      id: "exchange-floor-activity",
      heroSubject: "exchange floor activity with one clear human hero and soft background motion",
      visualStory: "Exchange floor rhythm during a risk-off session.",
      momentBefore: "Floor activity accelerates naturally.",
      momentAfter: "Trading flow continues.",
    },
    {
      id: "investor-office-review",
      heroSubject: "investment professional reviewing portfolio activity in a real office environment",
      visualStory: "An investor reviews market damage during a sell-off.",
      momentBefore: "The professional studies the session quietly.",
      momentAfter: "Analysis continues naturally.",
    },
  ],
  GOLD: [
    {
      id: "institutional-gold-vault",
      heroSubject: "institutional gold vault or secure bullion storage room as sole hero environment",
      visualStory: "Institutional safe-haven storage reflects gold demand.",
      momentBefore: "Vault activity remains controlled and routine.",
      momentAfter: "Secure storage continues normally.",
    },
    {
      id: "bullion-desk-documentary",
      heroSubject: "professional bullion desk in a regulated financial institution without readable documents",
      visualStory: "A bullion desk quietly signals precious metals flow.",
      momentBefore: "Staff prepare routine market storage tasks.",
      momentAfter: "The desk returns to normal workflow.",
    },
    {
      id: "gold-refinery-process",
      heroSubject: "gold refinery process area with one industrial production hero zone",
      visualStory: "Refinery activity reflects real precious metals supply chain.",
      momentBefore: "Production equipment completes a normal cycle.",
      momentAfter: "Industrial flow continues.",
    },
    {
      id: "secure-market-storage",
      heroSubject: "secure market storage facility corridor with restrained institutional atmosphere",
      visualStory: "Secure storage conveys safe-haven asset seriousness.",
      momentBefore: "Staff move through the facility naturally.",
      momentAfter: "Operations remain controlled.",
    },
  ],
  OIL_ENERGY: [
    {
      id: "oil-terminal",
      heroSubject: "active oil terminal with loading infrastructure as sole industrial hero",
      visualStory: "Terminal activity reflects energy supply conditions.",
      momentBefore: "Loading operations continue normally.",
      momentAfter: "Terminal flow remains steady.",
    },
    {
      id: "refinery-operations",
      heroSubject: "refinery operations area with one clear production hero zone",
      visualStory: "Refinery motion signals energy market supply.",
      momentBefore: "A process cycle completes.",
      momentAfter: "Operations continue.",
    },
    {
      id: "tanker-loading",
      heroSubject: "oil tanker loading operation at a real terminal from documentary distance",
      visualStory: "Tanker loading reflects supply chain pressure.",
      momentBefore: "Loading activity proceeds methodically.",
      momentAfter: "The operation continues naturally.",
    },
    {
      id: "pipeline-control-room",
      heroSubject: "pipeline or energy control room with unreadable screens and one operator hero",
      visualStory: "Energy infrastructure monitoring during supply uncertainty.",
      momentBefore: "Operators monitor routine systems.",
      momentAfter: "Control room work continues.",
    },
    {
      id: "offshore-platform",
      heroSubject: "offshore oil platform seen from documentary distance as sole industrial hero",
      visualStory: "Offshore production reflects energy supply reality.",
      momentBefore: "Platform operations continue in calm conditions.",
      momentAfter: "Industrial activity persists.",
    },
  ],
  CRYPTO_ETF: [
    {
      id: "institutional-crypto-desk",
      heroSubject: "institutional digital asset trading desk in a regulated financial office",
      visualStory: "Institutional desks reflect ETF flow into digital assets.",
      momentBefore: "Staff monitor regulated market activity.",
      momentAfter: "Professional workflow continues.",
    },
    {
      id: "custody-infrastructure",
      heroSubject: "digital asset custody infrastructure room with one secure technology hero zone",
      visualStory: "Custody infrastructure signals institutional adoption.",
      momentBefore: "Systems remain under normal monitoring.",
      momentAfter: "Operations continue securely.",
    },
    {
      id: "regulated-trading-office",
      heroSubject: "regulated trading office with one professional analyst hero and soft background depth",
      visualStory: "A regulated office environment captures ETF market flow.",
      momentBefore: "An analyst reviews market activity naturally.",
      momentAfter: "Work continues without hype styling.",
    },
    {
      id: "data-center-documentary",
      heroSubject: "financial technology data center corridor with restrained modern infrastructure",
      visualStory: "Infrastructure supports institutional digital asset markets.",
      momentBefore: "Technicians move through the facility normally.",
      momentAfter: "Operations remain stable.",
    },
  ],
  HORMUZ: [
    {
      id: "tanker-transit",
      heroSubject: "large oil tanker transiting a maritime shipping lane as sole vessel hero",
      visualStory: "Tanker transit reflects energy shipping risk.",
      momentBefore: "The vessel maintains steady passage.",
      momentAfter: "Transit continues naturally.",
    },
    {
      id: "shipping-lane-monitoring",
      heroSubject: "maritime shipping lane seen from elevated documentary distance with one vessel hero",
      visualStory: "Shipping lane monitoring conveys trade route tension.",
      momentBefore: "Traffic moves through the lane normally.",
      momentAfter: "Maritime flow continues.",
    },
    {
      id: "port-security",
      heroSubject: "port security and vessel approach zone with restrained maritime activity",
      visualStory: "Port security atmosphere during shipping uncertainty.",
      momentBefore: "Vessels hold position naturally.",
      momentAfter: "Port activity resumes routine motion.",
    },
    {
      id: "maritime-control-room",
      heroSubject: "maritime control room with one operator hero and unreadable navigation screens",
      visualStory: "Maritime control reflects global trade route risk.",
      momentBefore: "Operators monitor vessel movement.",
      momentAfter: "Control operations continue.",
    },
  ],
  CORPORATE_EARNINGS: [
    {
      id: "corporate-headquarters",
      heroSubject: "major corporate headquarters exterior as sole architectural business hero",
      visualStory: "Corporate headquarters anchors an earnings story.",
      momentBefore: "The building stands in normal business-day calm.",
      momentAfter: "Corporate presence remains unchanged.",
    },
    {
      id: "earnings-briefing-room",
      heroSubject: "corporate earnings briefing room before executives enter, without readable screens",
      visualStory: "A briefing room waits for corporate results.",
      momentBefore: "Chairs and table sit ready.",
      momentAfter: "The room remains professionally still.",
    },
    {
      id: "executive-investor-call",
      heroSubject: "executive preparing for an investor call in a real corporate office",
      visualStory: "An executive prepares to communicate corporate results.",
      momentBefore: "Notes and workspace are arranged naturally.",
      momentAfter: "Preparation continues without staging.",
    },
    {
      id: "financial-reporting-team",
      heroSubject: "financial reporting team working quietly in a corporate office environment",
      visualStory: "Reporting teams finalize corporate earnings communication.",
      momentBefore: "Analysts review materials from natural distance.",
      momentAfter: "Work continues professionally.",
    },
  ],
  DEFAULT: [
    {
      id: "default-a",
      heroSubject: "one credible real-world scene that carries the feeling of the macro release",
      visualStory: "A single authentic news moment.",
      momentBefore: "The scene holds the instant before attention peaks.",
      momentAfter: "The moment passes naturally.",
    },
    {
      id: "default-b",
      heroSubject: "one natural editorial scene with a clear hero subject and minimal clutter",
      visualStory: "A believable wire-service news frame.",
      momentBefore: "Activity settles into a natural pause.",
      momentAfter: "The scene continues without staging.",
    },
  ],
};

function resolveSceneVariantGroup(profile = {}, artDirection = {}) {
  const group = artDirection.artDirectionGroup;
  const eventKey = String(profile.canonicalEventKey || profile.eventKey || "").toUpperCase();
  if (group === "FED") {
    return /FOMC meeting room|policy room/i.test(artDirection.heroSubject || "") ? "FED_ROOM" : "FED_BUILDING";
  }
  if (SCENE_VARIANTS[group]) return group;
  if (/WALL_STREET_SELLOFF|MARKET_SELLOFF/.test(eventKey)) return "SELLOFF";
  if (/GOLD_RALLY|XAU_RALLY/.test(eventKey)) return "GOLD";
  if (/OIL_SUPPLY_DISRUPTION|ENERGY_DISRUPTION/.test(eventKey)) return "OIL_ENERGY";
  if (/BITCOIN_ETF_FLOWS|CRYPTO_ETF/.test(eventKey)) return "CRYPTO_ETF";
  if (/STRAIT_OF_HORMUZ_TENSION|HORMUZ/.test(eventKey)) return "HORMUZ";
  if (/CORPORATE_EARNINGS_MAJOR|CORPORATE_EARNINGS/.test(eventKey)) return "CORPORATE_EARNINGS";
  return "DEFAULT";
}

module.exports = {
  SCENE_VARIANTS,
  resolveSceneVariantGroup,
};
