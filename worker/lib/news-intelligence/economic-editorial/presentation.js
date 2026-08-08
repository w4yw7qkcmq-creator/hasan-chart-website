const { formatSiteFields, formatTelegramBody } = require("./formatters");

function formatTelegramBodyFromEditorial(editorialResult = {}) {
  return formatTelegramBody(editorialResult.body || editorialResult.structured);
}

function formatSiteFieldsFromEditorial(editorialResult = {}) {
  return formatSiteFields(editorialResult);
}

module.exports = {
  formatTelegramBodyFromEditorial,
  formatSiteFieldsFromEditorial,
};
