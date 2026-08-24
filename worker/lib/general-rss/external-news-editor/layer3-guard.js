const { validateExternalNewsDraftIntegrity } = require("./layer1-integrity");

function validateExternalNewsFinalGuard(input = {}) {
  return validateExternalNewsDraftIntegrity(input);
}

module.exports = {
  validateExternalNewsFinalGuard,
};
