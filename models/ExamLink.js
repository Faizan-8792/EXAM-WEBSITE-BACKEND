const crypto = require("crypto");
const { supabaseRequest } = require("../utils/supabaseClient");

const TABLE = "exam_links";
const LINK_TTL_MINUTES = 90;

const generateCode = () => {
  const randomPart = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `EXAM-${randomPart.slice(0, 4)}-${randomPart.slice(4, 8)}-${randomPart.slice(8, 12)}`;
};

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);

const toIsoString = (value) => {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
};

const mapExamLinkFromDb = (row = {}) => ({
  _id: row.id,
  id: row.id,
  code: row.code || "",
  expiresAt: row.expires_at,
  active: row.active !== false,
  createdByEmail: row.created_by_email || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const isExpired = (examLink = {}) => {
  if (!examLink.expiresAt) {
    return true;
  }

  return new Date(examLink.expiresAt).getTime() <= Date.now();
};

const create = async ({ createdByEmail = "" } = {}) => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + LINK_TTL_MINUTES);

  const rows = await supabaseRequest(TABLE, {
    method: "POST",
    body: {
      code: generateCode(),
      expires_at: expiresAt.toISOString(),
      active: true,
      created_by_email: createdByEmail
    },
    prefer: "return=representation"
  });

  return mapExamLinkFromDb(rows[0]);
};

const findByCode = async (code) => {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode) {
    return null;
  }

  const rows = await supabaseRequest(TABLE, {
    query: {
      select: "*",
      code: `eq.${normalizedCode}`,
      active: "eq.true",
      limit: "1"
    }
  });

  return rows[0] ? mapExamLinkFromDb(rows[0]) : null;
};

const findAll = async () => {
  const rows = await supabaseRequest(TABLE, {
    query: {
      select: "*",
      order: "created_at.desc"
    }
  });

  return Array.isArray(rows) ? rows.map(mapExamLinkFromDb) : [];
};

const deleteMany = async () => {
  const rows = await supabaseRequest(TABLE, {
    method: "DELETE",
    query: {
      id: "not.is.null"
    },
    prefer: "return=representation"
  });

  return {
    deletedCount: Array.isArray(rows) ? rows.length : 0
  };
};

module.exports = {
  LINK_TTL_MINUTES,
  normalizeCode,
  isExpired,
  create,
  findByCode,
  findAll,
  deleteMany
};
