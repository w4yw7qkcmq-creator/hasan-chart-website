const { resolveArtDirectionGroup } = require("../../editorial-art-director/config/event-art-directions");
const { pickFedHeroVariant } = require("../../editorial-art-director/resolve-editorial-art-direction");

const EVENT_PHOTO_STORIES = {
  CPI: {
    storyTitle: "Consumer prices shape everyday shopping decisions",
    visualStory: "Rising prices quietly influence routine purchase decisions inside a real American supermarket.",
    photographerIntent: "Document authentic consumer behavior inside a store without staging or explanation.",
    momentBefore: "The shopper compares prices on the shelf.",
    momentAfter: "The shopper continues shopping naturally.",
    subjectBehavior: "Natural, unaware of the camera, not posing, not performing for the lens.",
    backgroundBehavior: "Store aisle remains ordinary with soft background activity only.",
    environmentBehavior: "Real retail lighting, everyday supermarket atmosphere, no symbolic props.",
    documentaryStyle: "Documentary consumer economics photography.",
  },
  NFP: {
    storyTitle: "Labor market movement in a normal workday",
    visualStory: "Natural movement inside the job market through a real workplace or interview moment.",
    photographerIntent: "Capture hiring and employment atmosphere as it happens, not as a staged jobs report graphic.",
    momentBefore: "An employee arrives for an interview or enters the workplace.",
    momentAfter: "The interview or work routine continues naturally.",
    subjectBehavior: "No one looks at the camera. Natural professional behavior only.",
    backgroundBehavior: "Office activity stays secondary and out of focus when appropriate.",
    environmentBehavior: "Authentic office or hiring environment with credible daylight.",
    documentaryStyle: "Documentary labor-market photography.",
  },
  FED_BUILDING: {
    storyTitle: "Quiet moments before a central bank decision",
    visualStory: "Stillness outside the Federal Reserve before markets receive the policy decision.",
    photographerIntent: "Photograph institutional gravity through architecture without action-movie drama.",
    momentBefore: "Official cars and security presence settle into a routine pre-release atmosphere.",
    momentAfter: "The building remains the calm anchor of the policy moment.",
    subjectBehavior: "People remain small in frame; architecture carries the story.",
    backgroundBehavior: "Sky and facade lines stay clean with minimal movement.",
    environmentBehavior: "Institutional Washington daylight, restrained and credible.",
    documentaryStyle: "Documentary central-bank architecture photography.",
  },
  FED_ROOM: {
    storyTitle: "Quiet moments before a central bank decision",
    visualStory: "A hushed policy room waits before the decision lands — no action, no explosion, no exaggerated movement.",
    photographerIntent: "Show policy gravity through an empty official room, not a dramatic set piece.",
    momentBefore: "Chairs and table sit ready before officials enter or before attention peaks.",
    momentAfter: "The room remains the calm center of the policy moment.",
    subjectBehavior: "Any people remain peripheral and natural, never theatrical.",
    backgroundBehavior: "Room depth stays readable with minimal distraction.",
    environmentBehavior: "Professional conference lighting, official but not cinematic.",
    documentaryStyle: "Documentary institutional interior photography.",
  },
  POWELL: {
    storyTitle: "Markets wait for Powell to speak",
    visualStory: "A live central bank press moment as seen from the press corps, not a polished portrait session.",
    photographerIntent: "Capture Powell from among journalists during a real briefing.",
    momentBefore: "Powell prepares to answer the next question.",
    momentAfter: "The press conference continues with natural flow.",
    subjectBehavior: "Powell behaves naturally at the podium; journalists remain in context, not posing.",
    backgroundBehavior: "Federal Reserve briefing backdrop stays official and secondary.",
    environmentBehavior: "Realistic press-room lighting and credible briefing atmosphere.",
    documentaryStyle: "Documentary press-conference photography from the press pool.",
  },
  ECB: {
    storyTitle: "A formal European central bank moment",
    visualStory: "Institutional calm at the European Central Bank ahead of or during a policy release.",
    photographerIntent: "Document euro-area monetary authority through one architectural or institutional scene.",
    momentBefore: "The headquarters or policy setting holds a quiet pre-decision atmosphere.",
    momentAfter: "The institutional scene remains measured and professional.",
    subjectBehavior: "People, if present, remain natural and secondary to the institutional story.",
    backgroundBehavior: "Frankfurt urban context stays subtle and supportive only.",
    environmentBehavior: "Modern European institutional daylight, professional and restrained.",
    documentaryStyle: "Documentary European central-bank photography.",
  },
  ECB_SPEECH: {
    storyTitle: "Markets listen to the ECB president",
    visualStory: "A live ECB press briefing captured from the working press angle.",
    photographerIntent: "Photograph the speaker from among journalists, not as a studio portrait.",
    momentBefore: "The president prepares to answer or continue the briefing.",
    momentAfter: "The briefing continues naturally.",
    subjectBehavior: "Speaker and press behave naturally; no one performs for the camera.",
    backgroundBehavior: "ECB institutional backdrop remains official and secondary.",
    environmentBehavior: "Professional European press-room lighting.",
    documentaryStyle: "Documentary ECB press photography.",
  },
  GDP: {
    storyTitle: "Economic activity continues without celebration or failure",
    visualStory: "Ongoing commerce and logistics show the economy in motion without verdict or symbolism.",
    photographerIntent: "Document real economic movement through ports, trucks, or commerce.",
    momentBefore: "Workers or logistics continue routine activity.",
    momentAfter: "The economic scene keeps moving naturally.",
    subjectBehavior: "Workers behave naturally and are not posing.",
    backgroundBehavior: "Port or logistics environment stays environmental, not symbolic.",
    environmentBehavior: "Natural daylight over real commerce.",
    documentaryStyle: "Documentary economic activity photography.",
  },
  PCE: {
    storyTitle: "Consumer spending in an ordinary day",
    visualStory: "Everyday payment or shopping behavior that reflects consumption without data graphics.",
    photographerIntent: "Capture a real spending moment in retail or checkout context.",
    momentBefore: "A consumer reaches checkout or completes a purchase gesture.",
    momentAfter: "The transaction or shopping routine continues.",
    subjectBehavior: "Natural consumer behavior, unaware of the camera.",
    backgroundBehavior: "Retail environment stays ordinary and secondary.",
    environmentBehavior: "Natural consumer-space lighting.",
    documentaryStyle: "Documentary consumer spending photography.",
  },
  ISM: {
    storyTitle: "Production continues on the factory floor",
    visualStory: "Manufacturing activity in motion without turning the frame into a market dashboard.",
    photographerIntent: "Document real factory production and machinery in use.",
    momentBefore: "A worker or machine completes a routine production step.",
    momentAfter: "Production continues naturally.",
    subjectBehavior: "Workers behave naturally; no staged factory hero pose.",
    backgroundBehavior: "Factory depth stays industrial and credible.",
    environmentBehavior: "Practical factory lighting with real production atmosphere.",
    documentaryStyle: "Documentary industrial photography.",
  },
  DEFAULT: {
    storyTitle: "A credible macroeconomic news moment",
    visualStory: "One authentic scene that carries the feeling of the release without explaining it.",
    photographerIntent: "Capture a single believable financial-news moment on assignment.",
    momentBefore: "The scene holds the instant before the news moment peaks.",
    momentAfter: "The scene continues naturally after the moment passes.",
    subjectBehavior: "Natural behavior, not staged for the camera.",
    backgroundBehavior: "Background supports the hero without competing.",
    environmentBehavior: "Authentic location with natural light.",
    documentaryStyle: "Documentary financial photojournalism.",
  },
};

function resolvePhotoStoryTemplate(profile = {}, artDirection = {}) {
  const group = resolveArtDirectionGroup(profile.canonicalEventKey || profile.eventKey);
  if (group === "FED") {
    const variant = pickFedHeroVariant(profile);
    return EVENT_PHOTO_STORIES[variant] || EVENT_PHOTO_STORIES.FED_BUILDING;
  }
  if (artDirection.artDirectionGroup === "ECB_SPEECH") {
    return EVENT_PHOTO_STORIES.ECB_SPEECH;
  }
  if (group === "POWELL") return EVENT_PHOTO_STORIES.POWELL;
  if (group === "ECB") return EVENT_PHOTO_STORIES.ECB;
  if (group === "GDP") return EVENT_PHOTO_STORIES.GDP;
  if (group === "PCE") return EVENT_PHOTO_STORIES.PCE;
  if (group === "ISM") return EVENT_PHOTO_STORIES.ISM;
  if (group === "NFP") return EVENT_PHOTO_STORIES.NFP;
  if (group === "CPI") return EVENT_PHOTO_STORIES.CPI;
  return EVENT_PHOTO_STORIES.DEFAULT;
}

module.exports = {
  EVENT_PHOTO_STORIES,
  resolvePhotoStoryTemplate,
};
