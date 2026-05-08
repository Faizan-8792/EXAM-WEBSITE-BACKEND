const sanitizeHtml = require("sanitize-html");

const sanitizeText = (value, maxLength = 120) => {
  const stringValue = String(value || "");
  const cleaned = sanitizeHtml(stringValue, {
    allowedTags: [],
    allowedAttributes: {}
  }).trim();

  if (!cleaned) {
    return "";
  }

  return cleaned.slice(0, maxLength);
};

const sanitizeMultilineText = (value, maxLength = 500) => {
  const text = sanitizeText(value, maxLength);
  return text.replace(/\s+/g, " ").trim();
};

const sanitizeContact = (value) => {
  const onlyDigits = String(value || "").replace(/[^0-9]/g, "");
  return onlyDigits.slice(0, 15);
};

const sanitizeOptions = (options) => {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.slice(0, 4).map((option) => sanitizeText(option, 200));
};

const isValidObjectId = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );

module.exports = {
  sanitizeText,
  sanitizeMultilineText,
  sanitizeContact,
  sanitizeOptions,
  isValidObjectId
};
