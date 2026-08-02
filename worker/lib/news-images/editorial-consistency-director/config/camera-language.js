const CAMERA_LANGUAGE = {
  SPEECH_PORTRAIT: {
    cameraType: "Close Portrait",
    lens: "85mm",
    depthOfField: "Shallow depth of field with natural press-photo separation",
    cameraHeight: "Eye level",
    cameraDistance: "Press-pool working distance",
    cameraAngle: "Three-quarter briefing angle, not studio portrait setup",
    description: "Close portrait coverage from the press corps angle",
  },
  INSTITUTION_WIDE: {
    cameraType: "Wide Architectural",
    lens: "35mm",
    depthOfField: "Deep enough to read institutional architecture clearly",
    cameraHeight: "Eye level to slightly elevated natural stance",
    cameraDistance: "Respectful architectural documentary distance",
    cameraAngle: "Wide architectural documentary angle without dramatic tilt",
    description: "Wide architectural coverage of a central bank or institution",
  },
  CONSUMER_DOCUMENTARY: {
    cameraType: "Documentary Street / Store",
    lens: "50mm",
    depthOfField: "Moderate natural depth of field with believable background falloff",
    cameraHeight: "Eye level",
    cameraDistance: "Natural mid-scene documentary distance",
    cameraAngle: "Straight-on documentary angle, not overhead and not low hero angle",
    description: "Documentary consumer environment coverage inside retail or street commerce",
  },
  WORKPLACE_DOCUMENTARY: {
    cameraType: "Workplace Documentary",
    lens: "35mm",
    depthOfField: "Natural workplace depth with one primary subject zone",
    cameraHeight: "Eye level",
    cameraDistance: "Natural conversational workplace distance",
    cameraAngle: "Documentary side angle within the workplace",
    description: "Workplace documentary coverage for labor and employment stories",
  },
  GEOPOLITICS_LONG: {
    cameraType: "Long Lens News Coverage",
    lens: "135mm",
    depthOfField: "Compressed telephoto depth with clear subject isolation",
    cameraHeight: "Eye level or slightly elevated press position",
    cameraDistance: "Long-lens news coverage distance",
    cameraAngle: "Telephoto news angle with natural compression",
    description: "Long-lens news coverage for geopolitical field reporting",
  },
  INDUSTRIAL_DOCUMENTARY: {
    cameraType: "Industrial Documentary",
    lens: "70mm",
    depthOfField: "Environmental industrial depth with one production hero zone",
    cameraHeight: "Eye level",
    cameraDistance: "Working industrial documentary distance",
    cameraAngle: "Straight industrial documentary angle",
    description: "Industrial documentary coverage for energy and commodities stories",
  },
  TECH_DOCUMENTARY: {
    cameraType: "Modern Technology Documentary",
    lens: "50mm",
    depthOfField: "Natural modern-environment depth",
    cameraHeight: "Eye level",
    cameraDistance: "Natural technology workspace distance",
    cameraAngle: "Contemporary documentary angle without sci-fi styling",
    description: "Modern technology documentary coverage for digital asset stories",
  },
  MARKET_FLOOR: {
    cameraType: "Market Floor Documentary",
    lens: "50mm",
    depthOfField: "Natural trading floor depth with one primary subject zone",
    cameraHeight: "Eye level",
    cameraDistance: "Working market floor documentary distance",
    cameraAngle: "Straight market floor documentary angle",
    description: "Market floor documentary coverage for equity sell-off and volatility stories",
  },
  COMMODITY_DOCUMENTARY: {
    cameraType: "Commodity Documentary",
    lens: "70mm",
    depthOfField: "Controlled commodity environment depth with one hero zone",
    cameraHeight: "Eye level",
    cameraDistance: "Institutional commodity documentary distance",
    cameraAngle: "Restrained commodity documentary angle without advertisement styling",
    description: "Commodity documentary coverage for gold and precious metals stories",
  },
  INSTITUTIONAL_TECH: {
    cameraType: "Institutional Technology Documentary",
    lens: "50mm",
    depthOfField: "Modern institutional office depth with one hero zone",
    cameraHeight: "Eye level",
    cameraDistance: "Regulated technology finance workspace distance",
    cameraAngle: "Contemporary institutional angle without neon cyberpunk styling",
    description: "Institutional technology documentary coverage for crypto ETF and digital asset flow stories",
  },
  MARITIME_LONG: {
    cameraType: "Long Lens Maritime News Coverage",
    lens: "135mm",
    depthOfField: "Compressed telephoto maritime depth with one vessel hero zone",
    cameraHeight: "Eye level or slightly elevated press position",
    cameraDistance: "Long-lens maritime news coverage distance",
    cameraAngle: "Telephoto maritime news angle with natural compression",
    description: "Long-lens maritime news coverage for shipping lane and global trade risk stories",
  },
  CORPORATE_FINANCIAL: {
    cameraType: "Corporate Financial Documentary",
    lens: "50mm",
    depthOfField: "Natural corporate environment depth with one business hero zone",
    cameraHeight: "Eye level",
    cameraDistance: "Professional corporate documentary distance",
    cameraAngle: "Straight corporate financial documentary angle",
    description: "Corporate financial documentary coverage for earnings and business reporting stories",
  },
  DEFAULT_DOCUMENTARY: {
    cameraType: "General News Documentary",
    lens: "50mm",
    depthOfField: "Natural editorial depth of field",
    cameraHeight: "Eye level",
    cameraDistance: "Working photojournalist distance",
    cameraAngle: "Straight documentary angle",
    description: "General wire-service documentary coverage",
  },
};

function resolveCameraLanguageKey(profile = {}, artDirection = {}, entities = {}) {
  const group = artDirection.artDirectionGroup;
  const eventKey = String(profile.canonicalEventKey || profile.eventKey || "").toUpperCase();
  const personPolicy = profile.eventDefinition?.personPolicy;

  if (group === "POWELL" || group === "ECB_SPEECH" || personPolicy === "person_primary") {
    return "SPEECH_PORTRAIT";
  }
  if (group === "FED" || group === "ECB") {
    return "INSTITUTION_WIDE";
  }
  if (group === "CPI" || group === "PCE" || /RETAIL/.test(eventKey)) {
    return "CONSUMER_DOCUMENTARY";
  }
  if (group === "NFP") {
    return "WORKPLACE_DOCUMENTARY";
  }
  if (group === "SELLOFF" || /WALL_STREET_SELLOFF|MARKET_SELLOFF/.test(eventKey)) {
    return "MARKET_FLOOR";
  }
  if (group === "GOLD" || /GOLD_RALLY|XAU_RALLY/.test(eventKey)) {
    return "COMMODITY_DOCUMENTARY";
  }
  if (group === "OIL_ENERGY" || /OIL_SUPPLY_DISRUPTION|ENERGY_DISRUPTION/.test(eventKey)) {
    return "INDUSTRIAL_DOCUMENTARY";
  }
  if (group === "CRYPTO_ETF" || /BITCOIN_ETF_FLOWS|CRYPTO_ETF/.test(eventKey)) {
    return "INSTITUTIONAL_TECH";
  }
  if (group === "HORMUZ" || /STRAIT_OF_HORMUZ_TENSION|HORMUZ/.test(eventKey)) {
    return "MARITIME_LONG";
  }
  if (group === "CORPORATE_EARNINGS" || /CORPORATE_EARNINGS/.test(eventKey)) {
    return "CORPORATE_FINANCIAL";
  }
  if (/GEOPOLIT|WAR|CONFLICT|IRAN|UKRAINE|ISRAEL/.test(eventKey)) {
    return "GEOPOLITICS_LONG";
  }
  if (/OIL|USOIL|XAU|ENERGY|INDUSTRIAL/.test(eventKey)) {
    return "INDUSTRIAL_DOCUMENTARY";
  }
  if (/CRYPTO|BTC|ETH|BITCOIN/.test(eventKey)) {
    return "INSTITUTIONAL_TECH";
  }
  if (group === "ISM" || group === "GDP") {
    return "INDUSTRIAL_DOCUMENTARY";
  }
  return "DEFAULT_DOCUMENTARY";
}

function resolveCameraLanguage(profile = {}, artDirection = {}, entities = {}) {
  const key = resolveCameraLanguageKey(profile, artDirection, entities);
  return {
    key,
    ...(CAMERA_LANGUAGE[key] || CAMERA_LANGUAGE.DEFAULT_DOCUMENTARY),
  };
}

module.exports = {
  CAMERA_LANGUAGE,
  resolveCameraLanguage,
  resolveCameraLanguageKey,
};
