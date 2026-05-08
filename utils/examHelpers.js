const crypto = require("crypto");
const { RESULT_STATUS } = require("./constants");

const FAIL_NOTICE = "You will be notified by Central Office.";

const generateExamToken = () => crypto.randomBytes(24).toString("hex");

const generateCertificateId = () => {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `NAR-AIR-${timePart}-${randomPart}`;
};

const calculateRemainingSeconds = (startedAt, durationSeconds) => {
  const endTime = new Date(startedAt).getTime() + durationSeconds * 1000;
  const diff = endTime - Date.now();
  return Math.max(0, Math.floor(diff / 1000));
};

const buildResultPayload = (participant, passingMarks, showCertificateId = true) => ({
  participantId: participant._id,
  name: participant.name,
  totalQuestions: participant.totalQuestions,
  score: participant.score,
  correctAnswers: `${participant.score}/${participant.totalQuestions}`,
  passingMarks,
  result: participant.result || RESULT_STATUS.FAIL,
  passed: participant.result === RESULT_STATUS.PASS,
  date: participant.submittedAt || participant.date,
  terminatedDueToViolation: Boolean(participant.terminatedDueToViolation),
  violationCount: Number(participant.violationCount) || 0,
  terminationReason: participant.terminationReason || null,
  failNotice: participant.result === RESULT_STATUS.FAIL ? FAIL_NOTICE : null,
  showCertificateId,
  certificateId: showCertificateId ? participant.certificateId || null : null
});

module.exports = {
  generateExamToken,
  generateCertificateId,
  calculateRemainingSeconds,
  buildResultPayload,
  FAIL_NOTICE
};
