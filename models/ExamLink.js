const crypto = require("crypto");
const { supabaseRequest } = require("../utils/supabaseClient");

const TABLE = "exam_links";
const PARTICIPANTS_TABLE = "participants";

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
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const mapExamLinkFromDb = (row = {}) => ({
  _id: row.id,
  id: row.id,
  code: row.code || "",
  startTime: row.start_time || null,
  expiresAt: row.expires_at,
  active: row.active !== false,
  createdByEmail: row.created_by_email || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

/**
 * Returns true if the exam window has closed (end time passed).
 */
const isExpired = (examLink = {}) => {
  if (!examLink.expiresAt) return true;
  return new Date(examLink.expiresAt).getTime() <= Date.now();
};

/**
 * Returns true if the exam has not started yet (start time is in the future).
 */
const isNotStartedYet = (examLink = {}) => {
  if (!examLink.startTime) return false;
  return new Date(examLink.startTime).getTime() > Date.now();
};

/**
 * Returns seconds until the exam starts. 0 if already started or no startTime.
 */
const secondsUntilStart = (examLink = {}) => {
  if (!examLink.startTime) return 0;
  const diff = new Date(examLink.startTime).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 1000));
};

/**
 * Create a new exam link.
 * @param {object} opts
 * @param {string} opts.createdByEmail
 * @param {string|null} opts.startTime  - ISO string or null
 * @param {string|null} opts.endTime    - ISO string or null (this becomes expiresAt)
 */
const create = async ({ createdByEmail = "", startTime = null, endTime = null } = {}) => {
  const startIso = toIsoString(startTime);
  const endIso = toIsoString(endTime);

  if (!endIso) {
    throw new Error("End time is required to create an exam link");
  }

  if (startIso && new Date(startIso) >= new Date(endIso)) {
    throw new Error("Start time must be before end time");
  }

  const rows = await supabaseRequest(TABLE, {
    method: "POST",
    body: {
      code: generateCode(),
      start_time: startIso,
      expires_at: endIso,
      active: true,
      created_by_email: createdByEmail
    },
    prefer: "return=representation"
  });

  return mapExamLinkFromDb(rows[0]);
};

const findByCode = async (code) => {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode) return null;

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
  await supabaseRequest(PARTICIPANTS_TABLE, {
    method: "PATCH",
    query: {
      exam_link_id: "not.is.null"
    },
    body: {
      exam_link_id: null
    }
  });

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

const findById = async (id) => {
  if (!id) return null;

  const rows = await supabaseRequest(TABLE, {
    query: {
      select: "*",
      id: `eq.${id}`,
      limit: "1"
    }
  });

  return rows[0] ? mapExamLinkFromDb(rows[0]) : null;
};

const findByIdAndDelete = async (id) => {
  if (!id) return null;

  // Detach participants first so the foreign key reference does not block deletion.
  await supabaseRequest(PARTICIPANTS_TABLE, {
    method: "PATCH",
    query: {
      exam_link_id: `eq.${id}`
    },
    body: {
      exam_link_id: null
    }
  });

  const rows = await supabaseRequest(TABLE, {
    method: "DELETE",
    query: {
      id: `eq.${id}`
    },
    prefer: "return=representation"
  });

  return rows[0] ? mapExamLinkFromDb(rows[0]) : null;
};

module.exports = {
  normalizeCode,
  isExpired,
  isNotStartedYet,
  secondsUntilStart,
  create,
  findByCode,
  findAll,
  findById,
  findByIdAndDelete,
  deleteMany
};
