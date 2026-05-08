const express = require("express");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const Participant = require("../models/Participant");
const Question = require("../models/Question");
const Setting = require("../models/Setting");
const ExamLink = require("../models/ExamLink");
const { EXAM_DURATION_MINUTES, COURSE_NAME, RESULT_STATUS } = require("../utils/constants");
const {
  sanitizeText,
  isValidObjectId
} = require("../utils/sanitizers");
const {
  generateExamToken,
  generateCertificateId,
  calculateRemainingSeconds,
  buildResultPayload
} = require("../utils/examHelpers");
const { generateCertificatePdf } = require("../utils/certificate");

const router = express.Router();
const MAX_TAB_SWITCH_WARNINGS = 4;
const COMPLETED_ATTEMPT_MESSAGE = "You have already completed this exam. Re-appear is not allowed.";

const examRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1800,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many exam requests. Please try again shortly."
  }
});

router.use(examRequestLimiter);
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const buildClientFingerprint = (req) => {
  const userAgent = req.get("user-agent") || "unknown-agent";
  const clientId = sanitizeText(req.get("x-client-id"), 120);
  return crypto.createHash("sha256").update(`${userAgent}|${clientId}`).digest("hex");
};

const shuffleValues = (items) => {
  const values = [...items];

  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }

  return values;
};

const buildOptionOrderForQuestions = (questions = []) =>
  questions.reduce((orderByQuestion, question) => {
    if (question.questionType !== Question.QUESTION_TYPES.ONE_WORD) {
      orderByQuestion[String(question._id)] = shuffleValues([0, 1, 2, 3]);
    }
    return orderByQuestion;
  }, {});

const normalizeIdentityPart = (value) =>
  sanitizeText(value, 120)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const buildAttemptKey = (examLinkId, payload) =>
  crypto
    .createHash("sha256")
    .update([examLinkId, normalizeIdentityPart(payload.identity), normalizeIdentityPart(payload.name)].join("|"))
    .digest("hex");

const sanitizeParticipantInput = (body = {}) => {
  const payload = {
    identity: sanitizeText(body.identity, 160),
    name: sanitizeText(body.name, 120),
    branch: sanitizeText(body.branch, 120),
    designation: sanitizeText(body.designation, 120),
    class: sanitizeText(body.class, 120),
    principal: "",
    contact: ""
  };

  const errors = [];

  if (!payload.identity) errors.push("Employee ID is required");
  if (!payload.name) errors.push("Name is required");

  return { payload, errors };
};

const getNewAttemptValidationErrors = (payload = {}) => {
  const errors = [];

  if (!payload.branch) errors.push("Branch is required");

  return errors;
};

const mapQuestionsForExam = (questions, optionOrder = {}) =>
  questions
    .filter(Boolean)
    .map((questionDoc) => {
      const questionId = String(questionDoc._id);
      const questionType = questionDoc.questionType === Question.QUESTION_TYPES.ONE_WORD
        ? Question.QUESTION_TYPES.ONE_WORD
        : Question.QUESTION_TYPES.MCQ;

      if (questionType === Question.QUESTION_TYPES.ONE_WORD) {
        return {
          _id: questionDoc._id,
          question: questionDoc.question,
          questionType
        };
      }

      const storedOrder = Array.isArray(optionOrder[questionId]) ? optionOrder[questionId] : [0, 1, 2, 3];
      const safeOrder = storedOrder
        .map((optionIndex) => Number(optionIndex))
        .filter((optionIndex) => Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex <= 3);
      const finalOrder = safeOrder.length === 4 ? safeOrder : [0, 1, 2, 3];

      return {
        _id: questionDoc._id,
        question: questionDoc.question,
        questionType,
        options: finalOrder.map((optionIndex) => ({
          text: questionDoc.options[optionIndex],
          value: optionIndex
        }))
      };
    });

const singularizeWord = (word) => {
  if (word.length > 3 && word.endsWith("ies")) {
    return `${word.slice(0, -3)}y`;
  }

  if (word.length > 4 && /(ches|shes|sses|xes|zes)$/.test(word)) {
    return word.slice(0, -2);
  }

  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }

  return word;
};

const normalizeOneWordAnswer = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeWord)
    .join("");

const isOneWordAnswerCorrect = (selectedAnswer, correctText) => {
  const normalizedSelected = normalizeOneWordAnswer(selectedAnswer);
  const normalizedCorrect = normalizeOneWordAnswer(correctText);
  return Boolean(normalizedSelected && normalizedCorrect && normalizedSelected === normalizedCorrect);
};

const getValidExamLink = async (code) => {
  const examLink = await ExamLink.findByCode(code);

  if (!examLink || ExamLink.isExpired(examLink)) {
    return null;
  }

  return examLink;
};

const buildParticipantStartResponse = (participant, questions, remainingSeconds, examCode) => ({
  message: "Exam started successfully",
  participantId: participant._id,
  examToken: participant.examToken,
  totalQuestions: participant.totalQuestions,
  remainingSeconds,
  expiresAt: new Date(new Date(participant.examStartedAt).getTime() + participant.examDurationSeconds * 1000),
  examCode,
  questions: mapQuestionsForExam(questions, participant.optionOrder)
});

const getParticipantSession = async (participantId, examToken, clientFingerprint, populate = false) => {
  if (!isValidObjectId(participantId)) {
    return null;
  }

  let query = Participant.findById(participantId);
  if (populate) {
    query = query.populate("assignedQuestions");
  }

  const participant = await query;

  if (!participant || participant.examToken !== examToken) {
    return null;
  }

  if (participant.clientFingerprint && participant.clientFingerprint !== clientFingerprint) {
    return null;
  }

  if (!participant.clientFingerprint) {
    participant.clientFingerprint = clientFingerprint;
    await participant.save();
  }

  return participant;
};

router.get("/link/:code", async (req, res, next) => {
  try {
    const examCode = ExamLink.normalizeCode(req.params.code);
    const examLink = await ExamLink.findByCode(examCode);

    if (!examLink) {
      return res.status(404).json({ message: "Exam link is invalid" });
    }

    const expired = ExamLink.isExpired(examLink);

    return res.json({
      valid: !expired,
      expired,
      code: examLink.code,
      expiresAt: examLink.expiresAt
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/start", async (req, res, next) => {
  try {
    const { payload, errors } = sanitizeParticipantInput(req.body);
    const examCode = ExamLink.normalizeCode(req.body.examCode || req.body.code);

    if (errors.length) {
      return res.status(400).json({
        message: "Validation failed",
        errors
      });
    }

    if (!examCode) {
      return res.status(400).json({ message: "Valid exam URL or exam code is required" });
    }

    const examLink = await ExamLink.findByCode(examCode);

    if (!examLink) {
      return res.status(403).json({ message: "Exam link is invalid" });
    }

    const settings = await Setting.getSingleton();
    const clientFingerprint = buildClientFingerprint(req);
    const attemptKey = buildAttemptKey(examLink._id, payload);

    const existingForDetails = await Participant.findLatestByExamLinkAndAttemptKey(examLink._id, attemptKey);

    if (existingForDetails?.submitted) {
      existingForDetails.clientFingerprint = clientFingerprint;
      await existingForDetails.save();

      const effectivePassingMarks = Math.min(settings.passingMarks, existingForDetails.totalQuestions || 0);

      return res.json({
        message: COMPLETED_ATTEMPT_MESSAGE,
        alreadyCompleted: true,
        submitted: true,
        participantId: existingForDetails._id,
        examToken: existingForDetails.examToken,
        examCode: examLink.code,
        result: buildResultPayload(existingForDetails, effectivePassingMarks, settings.showCertificateId)
      });
    }

    if (ExamLink.isExpired(examLink)) {
      return res.status(403).json({ message: "Exam link is expired" });
    }

    if (existingForDetails) {
      existingForDetails.clientFingerprint = clientFingerprint;
      await existingForDetails.save();

      const existingParticipant = await Participant.findById(existingForDetails._id).populate("assignedQuestions");
      const remainingSeconds = calculateRemainingSeconds(
        existingParticipant.examStartedAt,
        existingParticipant.examDurationSeconds
      );

      return res.json(
        buildParticipantStartResponse(
          existingParticipant,
          existingParticipant.assignedQuestions,
          remainingSeconds,
          examLink.code
        )
      );
    }

    const newAttemptErrors = getNewAttemptValidationErrors(payload);

    if (newAttemptErrors.length) {
      return res.status(400).json({
        message: "Validation failed",
        errors: newAttemptErrors
      });
    }

    const availableQuestions = await Question.countDocuments();

    if (!availableQuestions) {
      return res.status(400).json({
        message: "No questions available. Please ask admin to add questions first."
      });
    }

    const configuredTotalQuestions = Math.max(1, Number(settings.totalQuestions) || 1);
    const totalQuestions = Math.min(availableQuestions, configuredTotalQuestions);
    const configuredExamDurationMinutes = Math.max(
      1,
      Math.floor(Number(settings.examDurationMinutes) || EXAM_DURATION_MINUTES)
    );
    const examDurationSeconds = configuredExamDurationMinutes * 60;

    const selectedQuestions = await Question.aggregate([{ $sample: { size: totalQuestions } }]);
    const optionOrder = buildOptionOrderForQuestions(selectedQuestions);
    const examToken = generateExamToken();
    const startedAt = new Date();

    const participant = await Participant.create({
      ...payload,
      clientFingerprint,
      examToken,
      examLinkId: examLink._id,
      attemptKey,
      examStartedAt: startedAt,
      examDurationSeconds,
      optionOrder,
      assignedQuestions: selectedQuestions.map((question) => question._id),
      totalQuestions,
      courseName: COURSE_NAME
    });

    return res.status(201).json({
      message: "Exam started successfully",
      participantId: participant._id,
      examToken,
      totalQuestions,
      remainingSeconds: examDurationSeconds,
      expiresAt: new Date(startedAt.getTime() + examDurationSeconds * 1000),
      examCode: examLink.code,
      questions: mapQuestionsForExam(selectedQuestions, optionOrder)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/state", async (req, res, next) => {
  try {
    const participantId = sanitizeText(req.query.participantId, 120);
    const examToken = sanitizeText(req.query.token, 120);

    if (!participantId || !examToken) {
      return res.status(400).json({ message: "participantId and token are required" });
    }

    const clientFingerprint = buildClientFingerprint(req);

    const participant = await getParticipantSession(participantId, examToken, clientFingerprint, true);

    if (!participant) {
      return res.status(401).json({ message: "Invalid exam session" });
    }

    const settings = await Setting.getSingleton();
    const effectivePassingMarks = Math.min(settings.passingMarks, participant.totalQuestions || 0);

    if (participant.submitted) {
      return res.json({
        submitted: true,
        result: buildResultPayload(participant, effectivePassingMarks, settings.showCertificateId)
      });
    }

    const remainingSeconds = calculateRemainingSeconds(
      participant.examStartedAt,
      participant.examDurationSeconds
    );

    return res.json({
      submitted: false,
      participantId: participant._id,
      totalQuestions: participant.totalQuestions,
      remainingSeconds,
      questions: mapQuestionsForExam(participant.assignedQuestions, participant.optionOrder),
      timeUp: remainingSeconds <= 0
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/submit", async (req, res, next) => {
  try {
    const participantId = sanitizeText(req.body.participantId, 120);
    const examToken = sanitizeText(req.body.token, 120);
    const submittedAnswers = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};

    if (!participantId || !examToken) {
      return res.status(400).json({ message: "participantId and token are required" });
    }

    const clientFingerprint = buildClientFingerprint(req);

    const participant = await getParticipantSession(participantId, examToken, clientFingerprint, true);

    if (!participant) {
      return res.status(401).json({ message: "Invalid exam session" });
    }

    const settings = await Setting.getSingleton();
    const questionDocs = participant.assignedQuestions.filter(Boolean);

    if (!questionDocs.length) {
      return res.status(400).json({
        message: "No assigned questions found for this participant"
      });
    }

    const totalQuestions = questionDocs.length;

    if (participant.submitted) {
      const effectivePassingMarks = Math.min(settings.passingMarks, totalQuestions);
      return res.json({
        message: "Exam already submitted",
        ...buildResultPayload(participant, effectivePassingMarks, settings.showCertificateId)
      });
    }

    let score = 0;
    const answers = questionDocs.map((questionDoc) => {
      const key = String(questionDoc._id);
      const isOneWordQuestion = questionDoc.questionType === Question.QUESTION_TYPES.ONE_WORD;
      const rawAnswer = submittedAnswers[key];
      const parsedValue = Number(rawAnswer);
      const selectedAnswer = isOneWordQuestion
        ? sanitizeText(rawAnswer, 200)
        : Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 3
          ? parsedValue
          : null;
      const isCorrect = isOneWordQuestion
        ? isOneWordAnswerCorrect(selectedAnswer, questionDoc.correctText)
        : selectedAnswer === questionDoc.correctAnswer;

      if (isCorrect) {
        score += 1;
      }

      return {
        question: questionDoc._id,
        selectedAnswer,
        isCorrect
      };
    });

    const effectivePassingMarks = Math.min(settings.passingMarks, totalQuestions);
    const passed = score >= effectivePassingMarks;

    participant.score = score;
    participant.totalQuestions = totalQuestions;
    participant.result = passed ? RESULT_STATUS.PASS : RESULT_STATUS.FAIL;
    participant.answers = answers;
    participant.submitted = true;
    participant.submittedAt = new Date();

    if (passed && settings.showCertificateId && !participant.certificateId) {
      participant.certificateId = generateCertificateId();
      participant.certificateIssuedAt = new Date();
    }

    await participant.save();

    return res.json({
      message: "Exam submitted successfully",
      ...buildResultPayload(participant, effectivePassingMarks, settings.showCertificateId)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/terminate", async (req, res, next) => {
  try {
    const participantId = sanitizeText(req.body.participantId, 120);
    const examToken = sanitizeText(req.body.token, 120);
    const reason = sanitizeText(req.body.reason, 300) || "Exam terminated due to repeated tab switching";
    const requestedViolationCount = Number(req.body.violationCount);

    if (!participantId || !examToken) {
      return res.status(400).json({ message: "participantId and token are required" });
    }

    const clientFingerprint = buildClientFingerprint(req);
    const participant = await getParticipantSession(participantId, examToken, clientFingerprint, true);

    if (!participant) {
      return res.status(401).json({ message: "Invalid exam session" });
    }

    const settings = await Setting.getSingleton();
    const questionDocs = participant.assignedQuestions.filter(Boolean);
    const totalQuestions = questionDocs.length;
    const effectivePassingMarks = Math.min(settings.passingMarks, totalQuestions);

    if (participant.submitted) {
      return res.json({
        message: "Exam already submitted",
        ...buildResultPayload(participant, effectivePassingMarks, settings.showCertificateId)
      });
    }

    const safeViolationCount = Number.isInteger(requestedViolationCount)
      ? Math.max(1, Math.min(requestedViolationCount, MAX_TAB_SWITCH_WARNINGS))
      : MAX_TAB_SWITCH_WARNINGS;

    participant.score = 0;
    participant.totalQuestions = totalQuestions;
    participant.result = RESULT_STATUS.FAIL;
    participant.answers = questionDocs.map((questionDoc) => ({
      question: questionDoc._id,
      selectedAnswer: null,
      isCorrect: false
    }));
    participant.submitted = true;
    participant.submittedAt = new Date();
    participant.terminatedDueToViolation = true;
    participant.violationCount = Math.max(participant.violationCount || 0, safeViolationCount);
    participant.terminationReason = reason;

    await participant.save();

    return res.json({
      message: "Exam terminated due to policy violation",
      ...buildResultPayload(participant, effectivePassingMarks, settings.showCertificateId)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/result/:participantId", async (req, res, next) => {
  try {
    const participantId = sanitizeText(req.params.participantId, 120);
    const examToken = sanitizeText(req.query.token, 120);

    if (!participantId || !examToken) {
      return res.status(400).json({ message: "participantId and token are required" });
    }

    const clientFingerprint = buildClientFingerprint(req);

    const participant = await getParticipantSession(participantId, examToken, clientFingerprint);

    if (!participant) {
      return res.status(401).json({ message: "Invalid exam session" });
    }

    if (!participant.submitted) {
      return res.status(400).json({ message: "Exam has not been submitted yet" });
    }

    const settings = await Setting.getSingleton();
    const effectivePassingMarks = Math.min(settings.passingMarks, participant.totalQuestions || 0);

    return res.json(buildResultPayload(participant, effectivePassingMarks, settings.showCertificateId));
  } catch (error) {
    return next(error);
  }
});

router.get("/certificate/:participantId", async (req, res, next) => {
  try {
    const participantId = sanitizeText(req.params.participantId, 120);
    const examToken = sanitizeText(req.query.token, 120);

    if (!participantId || !examToken) {
      return res.status(400).json({ message: "participantId and token are required" });
    }

    const clientFingerprint = buildClientFingerprint(req);

    const participant = await getParticipantSession(participantId, examToken, clientFingerprint);

    if (!participant) {
      return res.status(401).json({ message: "Invalid exam session" });
    }

    if (!participant.submitted || participant.result !== RESULT_STATUS.PASS) {
      return res.status(403).json({ message: "Certificate available only for passed participants" });
    }

    const settings = await Setting.getSingleton();
    const shouldShowCertificateId = settings.showCertificateId !== false;

    if (shouldShowCertificateId && !participant.certificateId) {
      participant.certificateId = generateCertificateId();
      participant.certificateIssuedAt = new Date();
      await participant.save();
    }

    const visibleCertificateId = shouldShowCertificateId ? participant.certificateId || "" : "";

    const certificatePdf = await generateCertificatePdf({
      name: participant.name,
      branch: participant.branch,
      examName: participant.courseName || COURSE_NAME,
      date: new Date(participant.submittedAt || participant.date).toLocaleDateString("en-IN"),
      certificateId: visibleCertificateId,
      showCertificateId: shouldShowCertificateId
    });

    const fileIdentifier = shouldShowCertificateId && participant.certificateId ? participant.certificateId : participant._id;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=certificate-${fileIdentifier}.pdf`);
    res.setHeader("Content-Length", certificatePdf.length);
    res.setHeader("Cache-Control", "no-store");

    return res.end(certificatePdf);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
