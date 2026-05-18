const DEFAULT_ALLOWED_ORIGINS = ["https://narayanagroupexamportal.netlify.app"];

const parseAllowedOrigins = () => {
  const rawOrigins =
    process.env.ALLOWED_ORIGINS ||
    process.env.FRONTEND_ORIGIN ||
    DEFAULT_ALLOWED_ORIGINS.join(",");

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

// Evaluated once at startup so all modules share the same parsed list.
const ALLOWED_ORIGINS = parseAllowedOrigins();

const isAllowedOrigin = (originHeader) => {
  if (!originHeader) return false;

  try {
    return ALLOWED_ORIGINS.includes(new URL(originHeader).origin);
  } catch {
    return false;
  }
};

module.exports = { ALLOWED_ORIGINS, isAllowedOrigin };
