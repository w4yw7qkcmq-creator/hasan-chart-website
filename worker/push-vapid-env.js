function getVapidEnv() {
  return {
    publicKey: String(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ""
    ).trim(),
    privateKey: String(process.env.VAPID_PRIVATE_KEY || "").trim(),
    subject: String(
      process.env.VAPID_SUBJECT || process.env.VAPID_MAILTO || "mailto:alerts@hasanchartworld.com"
    ).trim(),
  };
}

function getVapidEnvStatus() {
  const { publicKey, privateKey, subject } = getVapidEnv();

  return {
    configured: Boolean(publicKey && privateKey && subject),
    hasPublicKey: Boolean(publicKey),
    hasPrivateKey: Boolean(privateKey),
    hasSubject: Boolean(subject),
    subjectPreview: subject ? subject.slice(0, 48) : null,
  };
}

module.exports = {
  getVapidEnv,
  getVapidEnvStatus,
};
