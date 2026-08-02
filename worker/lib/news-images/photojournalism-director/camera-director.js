const CAMERA_PLANS = {
  CPI: {
    cameraPosition: "Standing in the supermarket aisle at a natural documentary distance",
    cameraDistance: "Natural mid-aisle distance, not wide establishing shot",
    cameraHeight: "Eye level",
    cameraAngle: "Straight-on documentary angle, not overhead and not low hero angle",
    lens: "50mm",
    depthOfField: "Moderate depth of field; shopper and shelf readable, background softly falls away",
    focusPlane: "Primary focus on the aisle and consumer behavior hero zone",
    framing: "Single-aisle frame with one clear hero zone and overlay negative space preserved",
    negativeSpace: "Lower-center and upper-left kept visually clean for headline and brand overlay",
  },
  NFP: {
    cameraPosition: "Inside the workplace or interview waiting area at eye level",
    cameraDistance: "Natural conversational distance, not close portrait",
    cameraHeight: "Eye level",
    cameraAngle: "Documentary straight angle from the side of the room",
    lens: "35mm",
    depthOfField: "Natural workplace depth with one primary subject zone",
    focusPlane: "Interview or workplace hero zone in focus",
    framing: "Single room frame with one employment story",
    negativeSpace: "Lower-left and upper-left kept clean for overlay",
  },
  FED_BUILDING: {
    cameraPosition: "On the street outside the Federal Reserve at a respectful documentary distance",
    cameraDistance: "Medium architectural distance, not aerial and not extreme close facade crop",
    cameraHeight: "Eye level to slightly elevated natural stance",
    cameraAngle: "Architectural documentary angle, not dramatic tilt",
    lens: "50mm",
    depthOfField: "Deep enough to read the facade clearly",
    focusPlane: "Building facade as the primary focus plane",
    framing: "Single-building frame with clean sky and institutional lines",
    negativeSpace: "Upper-left and lower headline zone kept clean",
  },
  FED_ROOM: {
    cameraPosition: "From the doorway or rear corner of the policy room",
    cameraDistance: "Natural interior documentary distance",
    cameraHeight: "Eye level",
    cameraAngle: "Straight interior documentary angle",
    lens: "35mm",
    depthOfField: "Room depth readable with calm background",
    focusPlane: "Conference table and chairs as primary focus plane",
    framing: "Single-room frame, no split-scene composition",
    negativeSpace: "Upper-left and lower overlay zones kept clean",
  },
  POWELL: {
    cameraPosition: "From among the press corps, not a direct portrait position",
    cameraDistance: "Press-pool working distance, not studio close-up",
    cameraHeight: "Eye level from seated or standing press angle",
    cameraAngle: "Three-quarter briefing angle, not straight-on portrait",
    lens: "85mm",
    depthOfField: "Moderate portrait depth with podium sharp and background restrained",
    focusPlane: "Podium speaker zone as primary focus plane",
    framing: "Single briefing frame with one speaker hero",
    negativeSpace: "Upper-left and lower overlay zones kept clean",
  },
  ECB: {
    cameraPosition: "From street level facing the ECB headquarters facade",
    cameraDistance: "Natural architectural documentary distance",
    cameraHeight: "Eye level",
    cameraAngle: "Architectural documentary angle with subtle perspective",
    lens: "50mm",
    depthOfField: "Facade clarity with soft urban background",
    focusPlane: "ECB headquarters as primary focus plane",
    framing: "Single institutional frame with one building hero",
    negativeSpace: "Upper-left and lower overlay zones kept clean",
  },
  ECB_SPEECH: {
    cameraPosition: "From among journalists in the ECB briefing room",
    cameraDistance: "Press-pool working distance",
    cameraHeight: "Eye level",
    cameraAngle: "Three-quarter briefing angle, not portrait setup",
    lens: "85mm",
    depthOfField: "Speaker zone in focus with restrained background",
    focusPlane: "Podium and speaker as primary focus plane",
    framing: "Single briefing frame",
    negativeSpace: "Upper-left and lower overlay zones kept clean",
  },
  DEFAULT: {
    cameraPosition: "Natural documentary position at the scene",
    cameraDistance: "Working photojournalist distance",
    cameraHeight: "Eye level",
    cameraAngle: "Straight documentary angle",
    lens: "50mm",
    depthOfField: "Natural editorial depth of field",
    focusPlane: "Single hero subject plane",
    framing: "Single-frame photojournalism composition",
    negativeSpace: "Overlay-safe zones kept visually clean",
  },
};

function resolveCameraPlanKey(profile = {}, artDirection = {}) {
  const group = artDirection.artDirectionGroup;
  if (group === "CPI") return "CPI";
  if (group === "NFP") return "NFP";
  if (group === "FED") {
    return /FOMC meeting room|policy room/i.test(artDirection.heroSubject || "") ? "FED_ROOM" : "FED_BUILDING";
  }
  if (group === "POWELL") return "POWELL";
  if (group === "ECB_SPEECH") return "ECB_SPEECH";
  if (group === "ECB") return "ECB";
  return "DEFAULT";
}

function resolveCameraDirection(photoStory = {}, artDirection = {}, composition = {}) {
  const key = resolveCameraPlanKey({ canonicalEventKey: photoStory.eventKey }, artDirection);
  const plan = { ...(CAMERA_PLANS[key] || CAMERA_PLANS.DEFAULT) };

  if (artDirection.lens) {
    plan.lens = artDirection.lens;
  }
  if (artDirection.depthOfField) {
    plan.depthOfField = artDirection.depthOfField;
  }
  if (composition.negativeSpaceInstruction) {
    plan.negativeSpaceInstruction = composition.negativeSpaceInstruction;
  }

  return {
    ...plan,
    cameraPlanKey: key,
    direction: artDirection.cameraDirection || plan.cameraPosition,
    lighting: artDirection.lighting || "natural documentary lighting",
  };
}

module.exports = {
  CAMERA_PLANS,
  resolveCameraDirection,
  resolveCameraPlanKey,
};
