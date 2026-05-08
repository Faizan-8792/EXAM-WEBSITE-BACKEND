const express = require("express");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const Question = require("../models/Question");
const Participant = require("../models/Participant");
const Setting = require("../models/Setting");
const ExamLink = require("../models/ExamLink");
const { requireDbConnection } = require("../utils/db");
const {
  verifyAdmin,
  isValidAdminEmail,
  JWT_ISSUER,
  JWT_AUDIENCE,
  getJwtSecret
} = require("../middleware/adminAuth");
const { sanitizeMultilineText, sanitizeOptions, sanitizeText, isValidObjectId } = require("../utils/sanitizers");
const { buildParticipantsWorkbook } = require("../utils/excelExport");

const router = express.Router();

const DEFAULT_ALLOWED_ORIGINS = ["https://narayanagroupexamportal.netlify.app"];

const parseAllowedOrigins = () => {
  const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_ORIGIN || DEFAULT_ALLOWED_ORIGINS.join(",");

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
};

const ALLOWED_ORIGINS = parseAllowedOrigins();

const isAllowedOrigin = (originHeader) => {
  if (!originHeader) {
    return false;
  }

  try {
    const normalizedOrigin = new URL(originHeader).origin;
    return ALLOWED_ORIGINS.includes(normalizedOrigin);
  } catch (error) {
    return false;
  }
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Try again later."
  }
});

const failedLoginAttempts = new Map();

const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

const getLoginAttemptKey = (email, req) => `${req.ip || "unknown-ip"}:${email}`;

const getLockoutState = (key) => {
  const state = failedLoginAttempts.get(key);

  if (!state) {
    return null;
  }

  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    return state;
  }

  if (state.firstAttemptAt && Date.now() - state.firstAttemptAt > LOCKOUT_WINDOW_MS) {
    failedLoginAttempts.delete(key);
    return null;
  }

  if (state.lockedUntil && state.lockedUntil <= Date.now()) {
    failedLoginAttempts.delete(key);
    return null;
  }

  return state;
};

const trackFailedLogin = (key) => {
  const existing = failedLoginAttempts.get(key);
  const now = Date.now();

  if (!existing || now - existing.firstAttemptAt > LOCKOUT_WINDOW_MS) {
    failedLoginAttempts.set(key, {
      count: 1,
      firstAttemptAt: now,
      lockedUntil: null
    });
    return;
  }

  const nextCount = existing.count + 1;
  const shouldLock = nextCount >= LOCKOUT_ATTEMPTS;

  failedLoginAttempts.set(key, {
    count: nextCount,
    firstAttemptAt: existing.firstAttemptAt,
    lockedUntil: shouldLock ? now + LOCKOUT_WINDOW_MS : null
  });
};

const clearFailedLogin = (key) => {
  failedLoginAttempts.delete(key);
};

const enforceTrustedOrigin = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const origin = req.get("origin");
  const host = req.get("host");
  const requestedWith = req.get("x-requested-with");

  if (!origin || requestedWith !== "XMLHttpRequest") {
    return res.status(403).json({ message: "Blocked untrusted request" });
  }

  try {
    const parsedOrigin = new URL(origin);

    if (host && parsedOrigin.host === host) {
      return next();
    }

    if (isAllowedOrigin(origin)) {
      return next();
    }

    return res.status(403).json({ message: "Blocked cross-origin request" });
  } catch (error) {
    return res.status(403).json({ message: "Invalid request origin" });
  }
};

router.use(enforceTrustedOrigin);

const parseCorrectAnswerIndex = (value) => {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 3) {
    return parsed;
  }

  if (Number.isInteger(parsed) && parsed === 4) {
    return 3;
  }

  return null;
};

const parseQuestionType = (value) =>
  value === Question.QUESTION_TYPES.ONE_WORD ? Question.QUESTION_TYPES.ONE_WORD : Question.QUESTION_TYPES.MCQ;

const validateQuestionPayload = (body = {}) => {
  const questionType = parseQuestionType(body.questionType);
  const question = sanitizeMultilineText(body.question, 500);
  const options = questionType === Question.QUESTION_TYPES.MCQ ? sanitizeOptions(body.options) : ["", "", "", ""];
  const correctAnswer = questionType === Question.QUESTION_TYPES.MCQ ? parseCorrectAnswerIndex(body.correctAnswer) : 0;
  const correctText = questionType === Question.QUESTION_TYPES.ONE_WORD ? sanitizeText(body.correctText, 200) : "";

  const errors = [];

  if (!question) {
    errors.push("Question text is required");
  }

  if (questionType === Question.QUESTION_TYPES.MCQ && (options.length !== 4 || options.some((option) => !option))) {
    errors.push("Exactly 4 valid options are required");
  }

  if (questionType === Question.QUESTION_TYPES.MCQ && (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > 3)) {
    errors.push("Correct answer must be selected between option 1 and option 4");
  }

  if (questionType === Question.QUESTION_TYPES.ONE_WORD && !correctText) {
    errors.push("Correct one-word answer is required");
  }

  return {
    errors,
    payload: {
      questionType,
      question,
      options,
      correctAnswer,
      correctText
    }
  };
};

const getFrontendBaseUrl = (req) => {
  const configuredOrigin = String(process.env.FRONTEND_ORIGIN || "").trim().replace(/\/+$/, "");

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const requestOrigin = String(req.get("origin") || "").trim().replace(/\/+$/, "");

  if (requestOrigin) {
    return requestOrigin;
  }

  return `${req.protocol}://${req.get("host")}`;
};

const getParticipantExamStatus = (participant = {}) => {
  if (participant.terminatedDueToViolation) {
    return "Terminated";
  }

  if (participant.terminationReason) {
    return "Left Exam";
  }

  if (participant.submitted) {
    return "Submitted";
  }

  return "In Progress";
};

router.post("/login", loginLimiter, async (req, res) => {
  const email = sanitizeText(req.body.email, 150).toLowerCase();
  const password = String(req.body.password || "");
  const adminPassword = process.env.ADMIN_PASSWORD || "admin-robotics@1234";
  const attemptKey = getLoginAttemptKey(email, req);
  const lockoutState = getLockoutState(attemptKey);

  if (lockoutState?.lockedUntil) {
    const retryAfterSeconds = Math.max(1, Math.ceil((lockoutState.lockedUntil - Date.now()) / 1000));
    return res.status(429).json({
      message: `Account temporarily locked. Try again in ${retryAfterSeconds} seconds.`
    });
  }

  if (!isValidAdminEmail(email)) {
    trackFailedLogin(attemptKey);
    return res.status(403).json({ message: "Only @narayanagroup.com admin emails are allowed" });
  }

  if (password !== adminPassword) {
    trackFailedLogin(attemptKey);
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  clearFailedLogin(attemptKey);

  const token = jwt.sign(
    {
      role: "admin",
      email
    },
    getJwtSecret(),
    {
      expiresIn: "8h",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    }
  );

  res.cookie("adminToken", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000
  });

  return res.json({
    message: "Admin login successful",
    email,
    token
  });
});

router.post("/logout", (req, res) => {
  res.clearCookie("adminToken", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  });
  return res.json({ message: "Logged out" });
});

router.get("/me", verifyAdmin, (req, res) => {
  return res.json({
    email: req.admin.email
  });
});

router.use(requireDbConnection);

router.get("/settings", verifyAdmin, async (req, res, next) => {
  try {
    const settings = await Setting.getSingleton();
    return res.json(settings);
  } catch (error) {
    return next(error);
  }
});

router.put("/settings", verifyAdmin, async (req, res, next) => {
  try {
    const passingMarks = Number(req.body.passingMarks);
    const totalQuestions = Number(req.body.totalQuestions);
    const examDurationMinutes = Number(req.body.examDurationMinutes);
    const showCertificateIdRaw = req.body.showCertificateId;

    let showCertificateId;
    if (typeof showCertificateIdRaw === "boolean") {
      showCertificateId = showCertificateIdRaw;
    } else if (typeof showCertificateIdRaw === "string") {
      if (showCertificateIdRaw.toLowerCase() === "true") {
        showCertificateId = true;
      } else if (showCertificateIdRaw.toLowerCase() === "false") {
        showCertificateId = false;
      }
    }

    if (!Number.isInteger(passingMarks) || passingMarks < 0) {
      return res.status(400).json({ message: "Passing marks must be a non-negative integer" });
    }

    if (!Number.isInteger(totalQuestions) || totalQuestions < 1) {
      return res.status(400).json({ message: "Total questions must be at least 1" });
    }

    if (!Number.isInteger(examDurationMinutes) || examDurationMinutes < 1) {
      return res.status(400).json({ message: "Exam time must be at least 1 minute" });
    }

    if (passingMarks > totalQuestions) {
      return res
        .status(400)
        .json({ message: "Passing marks cannot be greater than total questions" });
    }

    const settings = await Setting.getSingleton();

    if (typeof showCertificateId !== "boolean") {
      showCertificateId = settings.showCertificateId !== false;
    }

    settings.passingMarks = passingMarks;
    settings.totalQuestions = totalQuestions;
    settings.examDurationMinutes = examDurationMinutes;
    settings.showCertificateId = showCertificateId;

    await settings.save();

    return res.json({
      message: "Settings updated successfully",
      settings
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/exam-links", verifyAdmin, async (req, res, next) => {
  try {
    const examLink = await ExamLink.create({
      createdByEmail: req.admin.email
    });
    const frontendBaseUrl = getFrontendBaseUrl(req);

    return res.status(201).json({
      message: "Exam URL generated successfully",
      code: examLink.code,
      url: `${frontendBaseUrl}/exam-link/${encodeURIComponent(examLink.code)}`,
      neverExpires: true,
      expiresAt: examLink.expiresAt,
      expiresInMinutes: ExamLink.LINK_TTL_MINUTES
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/exam-links", verifyAdmin, async (req, res, next) => {
  try {
    const [examLinks, usageCounts] = await Promise.all([
      ExamLink.findAll(),
      Participant.countByExamLink()
    ]);
    const frontendBaseUrl = getFrontendBaseUrl(req);

    return res.json(
      examLinks.map((examLink) => {
        const expired = ExamLink.isExpired(examLink);

        return {
          id: examLink._id,
          code: examLink.code,
          url: `${frontendBaseUrl}/exam-link/${encodeURIComponent(examLink.code)}`,
          createdAt: examLink.createdAt,
          expiresAt: examLink.expiresAt,
          active: Boolean(examLink.active),
          expired,
          status: examLink.active && !expired ? "Active" : "Expired",
          neverExpires: true,
          usedCount: usageCounts[examLink._id] || 0
        };
      })
    );
  } catch (error) {
    return next(error);
  }
});

router.get("/questions", verifyAdmin, async (req, res, next) => {
  try {
    const questions = await Question.find().sort({ createdAt: -1 });
    return res.json(questions);
  } catch (error) {
    return next(error);
  }
});

router.post("/questions", verifyAdmin, async (req, res, next) => {
  try {
    const { errors, payload } = validateQuestionPayload(req.body);

    if (errors.length) {
      return res.status(400).json({
        message: "Validation failed",
        errors
      });
    }

    const question = await Question.create(payload);

    return res.status(201).json({
      message: "Question added successfully",
      question
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/questions/:id", verifyAdmin, async (req, res, next) => {
  try {
    const questionId = sanitizeText(req.params.id, 120);

    if (!isValidObjectId(questionId)) {
      return res.status(400).json({ message: "Invalid question id" });
    }

    const { errors, payload } = validateQuestionPayload(req.body);

    if (errors.length) {
      return res.status(400).json({
        message: "Validation failed",
        errors
      });
    }

    const updatedQuestion = await Question.findByIdAndUpdate(questionId, payload, {
      new: true,
      runValidators: true
    });

    if (!updatedQuestion) {
      return res.status(404).json({ message: "Question not found" });
    }

    return res.json({
      message: "Question updated successfully",
      question: updatedQuestion
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/questions/:id", verifyAdmin, async (req, res, next) => {
  try {
    const questionId = sanitizeText(req.params.id, 120);

    if (!isValidObjectId(questionId)) {
      return res.status(400).json({ message: "Invalid question id" });
    }

    const deletedQuestion = await Question.findByIdAndDelete(questionId);

    if (!deletedQuestion) {
      return res.status(404).json({ message: "Question not found" });
    }

    return res.json({ message: "Question deleted successfully" });
  } catch (error) {
    return next(error);
  }
});

router.get("/participants", verifyAdmin, async (req, res, next) => {
  try {
    const participants = await Participant.find({}, "-examToken -answers -clientFingerprint")
      .sort({ date: -1 })
      .lean();

    return res.json(
      participants.map((participant) => ({
        ...participant,
        examStatus: getParticipantExamStatus(participant)
      }))
    );
  } catch (error) {
    return next(error);
  }
});

router.get("/participants/export/excel", verifyAdmin, async (req, res, next) => {
  try {
    const participants = await Participant.find({}, "-examToken -answers -clientFingerprint")
      .sort({ date: -1 })
      .lean();

    const workbookBuffer = await buildParticipantsWorkbook(participants);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=participants-report-${Date.now()}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(workbookBuffer);
  } catch (error) {
    return next(error);
  }
});

router.delete("/participants/:id", verifyAdmin, async (req, res, next) => {
  try {
    const participantId = sanitizeText(req.params.id, 120);

    if (!isValidObjectId(participantId)) {
      return res.status(400).json({ message: "Invalid participant id" });
    }

    const deletedParticipant = await Participant.findByIdAndDelete(participantId);

    if (!deletedParticipant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json({ message: "Participant deleted successfully" });
  } catch (error) {
    return next(error);
  }
});

router.delete("/participants", verifyAdmin, async (req, res, next) => {
  try {
    const confirmationText = sanitizeText(req.body.confirmationText, 80);

    if (confirmationText !== "CLEAR_ALL") {
      return res.status(400).json({
        message: "Invalid confirmation text"
      });
    }

    const result = await Participant.deleteMany({});

    return res.json({
      message: "All participants cleared successfully",
      deletedCount: result.deletedCount || 0
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
