const jwt = require("jsonwebtoken");

const JWT_ISSUER = "narayana-exam-system";
const JWT_AUDIENCE = "narayana-admin-panel";

const getJwtSecret = () => process.env.JWT_SECRET || "dev_secret_change_me";

const extractBearerToken = (req) => {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return "";
  }

  return token.trim();
};

const getAdminTokenFromRequest = (req) => {
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    return bearerToken;
  }

  return req.cookies?.adminToken || "";
};

const getJwtVerifyOptions = () => ({
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE
});

const isValidAdminEmail = (email) => {
  const adminDomain = (process.env.ADMIN_DOMAIN || "narayanagroup.com").replace(/^@/, "").toLowerCase();
  const regex = new RegExp(`^[^@\\s]+@${adminDomain.replace(/\./g, "\\.")}$`, "i");
  return regex.test(String(email || "").trim());
};

const getAdminFromRequest = (req) => {
  const token = getAdminTokenFromRequest(req);

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), getJwtVerifyOptions());

    if (decoded.role !== "admin" || !isValidAdminEmail(decoded.email)) {
      return null;
    }

    return decoded;
  } catch (error) {
    return null;
  }
};

const verifyAdmin = (req, res, next) => {
  const decoded = getAdminFromRequest(req);

  if (!decoded) {
    return res.status(401).json({ message: "Invalid session" });
  }

  req.admin = decoded;
  return next();
};

module.exports = {
  verifyAdmin,
  isValidAdminEmail,
  getAdminFromRequest,
  getAdminTokenFromRequest,
  JWT_ISSUER,
  JWT_AUDIENCE,
  getJwtSecret
};
