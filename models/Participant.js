const { COURSE_NAME, EXAM_DURATION_SECONDS, RESULT_STATUS } = require("../utils/constants");
const Question = require("./Question");
const { supabaseRequest } = require("../utils/supabaseClient");

const TABLE = "participants";

const toIsoString = (value) => {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
};

const mapAnswerFromDb = (answer = {}) => ({
  question: answer.question || answer.question_id || null,
  selectedAnswer:
    answer.selectedAnswer === undefined ? answer.selected_answer ?? null : answer.selectedAnswer,
  isCorrect: Boolean(answer.isCorrect === undefined ? answer.is_correct : answer.isCorrect)
});

const mapAnswerToDb = (answer = {}) => ({
  question_id: answer.question?._id || answer.question || answer.question_id || null,
  selected_answer:
    answer.selectedAnswer === undefined ? answer.selected_answer ?? null : answer.selectedAnswer,
  is_correct: Boolean(answer.isCorrect === undefined ? answer.is_correct : answer.isCorrect)
});

const getAssignedQuestionIds = (assignedQuestions = []) =>
  assignedQuestions
    .map((question) => question?._id || question?.id || question)
    .filter(Boolean)
    .map(String);

const mapParticipantToDb = (participant = {}) => ({
  name: participant.name,
  participant_identity: participant.identity || "",
  branch: participant.branch,
  designation: participant.designation || "",
  teaching_class: participant.class || "",
  principal: participant.principal || "",
  contact: participant.contact || "",
  client_fingerprint: participant.clientFingerprint,
  score: Number(participant.score) || 0,
  total_questions: Number(participant.totalQuestions) || 0,
  result: participant.result || null,
  date: toIsoString(participant.date) || new Date().toISOString(),
  exam_token: participant.examToken,
  exam_link_id: participant.examLinkId || null,
  attempt_key: participant.attemptKey || null,
  exam_started_at: toIsoString(participant.examStartedAt),
  exam_duration_seconds: Number(participant.examDurationSeconds) || EXAM_DURATION_SECONDS,
  assigned_question_ids: getAssignedQuestionIds(participant.assignedQuestions),
  option_order: participant.optionOrder && typeof participant.optionOrder === "object" ? participant.optionOrder : {},
  answers: Array.isArray(participant.answers) ? participant.answers.map(mapAnswerToDb) : [],
  submitted: Boolean(participant.submitted),
  submitted_at: toIsoString(participant.submittedAt),
  violation_count: Number(participant.violationCount) || 0,
  terminated_due_to_violation: Boolean(participant.terminatedDueToViolation),
  termination_reason: participant.terminationReason || null,
  course_name: participant.courseName || COURSE_NAME,
  certificate_id: participant.certificateId || null,
  certificate_issued_at: toIsoString(participant.certificateIssuedAt)
});

const applyProjection = (participant, projection = "") => {
  if (!projection || typeof projection !== "string") {
    return participant;
  }

  const excludedFields = projection
    .split(/\s+/)
    .filter((field) => field.startsWith("-"))
    .map((field) => field.slice(1));

  excludedFields.forEach((field) => {
    delete participant[field];
  });

  return participant;
};

const sortParticipants = (participants, sortSpec = {}) => {
  if (sortSpec.date === -1 || sortSpec.createdAt === -1) {
    return participants.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  if (sortSpec.date === 1 || sortSpec.createdAt === 1) {
    return participants.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  }

  return participants;
};

class ParticipantDocument {
  constructor(row = {}) {
    this._id = row.id;
    this.id = row.id;
    this.identity = row.participant_identity || "";
    this.name = row.name || "";
    this.branch = row.branch || "";
    this.designation = row.designation || "";
    this.class = row.teaching_class || "";
    this.principal = row.principal || "";
    this.contact = row.contact || "";
    this.clientFingerprint = row.client_fingerprint || "";
    this.score = Number(row.score) || 0;
    this.totalQuestions = Number(row.total_questions) || 0;
    this.result = row.result || null;
    this.date = row.date;
    this.examToken = row.exam_token || "";
    this.examLinkId = row.exam_link_id || null;
    this.attemptKey = row.attempt_key || null;
    this.examStartedAt = row.exam_started_at;
    this.examDurationSeconds = Number(row.exam_duration_seconds) || EXAM_DURATION_SECONDS;
    this.assignedQuestions = Array.isArray(row.assigned_question_ids) ? row.assigned_question_ids : [];
    this.optionOrder = row.option_order && typeof row.option_order === "object" ? row.option_order : {};
    this.answers = Array.isArray(row.answers) ? row.answers.map(mapAnswerFromDb) : [];
    this.submitted = Boolean(row.submitted);
    this.submittedAt = row.submitted_at;
    this.violationCount = Number(row.violation_count) || 0;
    this.terminatedDueToViolation = Boolean(row.terminated_due_to_violation);
    this.terminationReason = row.termination_reason || null;
    this.courseName = row.course_name || COURSE_NAME;
    this.certificateId = row.certificate_id || null;
    this.certificateIssuedAt = row.certificate_issued_at || null;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  toJSON() {
    return { ...this };
  }

  async save() {
    const rows = await supabaseRequest(TABLE, {
      method: "PATCH",
      query: {
        id: `eq.${this._id}`
      },
      body: mapParticipantToDb(this),
      prefer: "return=representation"
    });

    if (rows[0]) {
      const updated = new ParticipantDocument(rows[0]);
      Object.keys(updated).forEach((key) => {
        this[key] = updated[key];
      });
    }

    return this;
  }
}

class ParticipantQuery {
  constructor(loader, options = {}) {
    this.loader = loader;
    this.projection = options.projection || "";
    this.sortSpec = {};
    this.shouldPopulateAssignedQuestions = false;
    this.shouldLean = false;
    this.expectsArray = Boolean(options.expectsArray);
  }

  populate(field) {
    if (field === "assignedQuestions") {
      this.shouldPopulateAssignedQuestions = true;
    }

    return this;
  }

  sort(sortSpec = {}) {
    this.sortSpec = sortSpec;
    return this;
  }

  lean() {
    this.shouldLean = true;
    return this;
  }

  async populateParticipant(participant) {
    if (!participant || !this.shouldPopulateAssignedQuestions) {
      return participant;
    }

    const questionIds = getAssignedQuestionIds(participant.assignedQuestions);
    participant.assignedQuestions = await Question.findByIds(questionIds);
    return participant;
  }

  async exec() {
    const rows = await this.loader();

    if (!this.expectsArray) {
      const document = rows[0] ? new ParticipantDocument(rows[0]) : null;
      const populatedDocument = await this.populateParticipant(document);
      return this.shouldLean && populatedDocument ? populatedDocument.toJSON() : populatedDocument;
    }

    const documents = rows.map((row) => new ParticipantDocument(row));
    const populatedDocuments = [];

    for (const document of documents) {
      populatedDocuments.push(await this.populateParticipant(document));
    }

    const sortedDocuments = sortParticipants(populatedDocuments, this.sortSpec);

    if (this.shouldLean) {
      return sortedDocuments.map((document) => applyProjection(document.toJSON(), this.projection));
    }

    return sortedDocuments;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

const create = async (payload) => {
  const rows = await supabaseRequest(TABLE, {
    method: "POST",
    body: mapParticipantToDb({
      ...payload,
      identity: payload.identity || "",
      score: 0,
      totalQuestions: payload.totalQuestions || 0,
      result: null,
      date: new Date(),
      answers: [],
      submitted: false,
      violationCount: 0,
      terminatedDueToViolation: false,
      terminationReason: null,
      courseName: payload.courseName || COURSE_NAME,
      examLinkId: payload.examLinkId || null,
      attemptKey: payload.attemptKey || null,
      optionOrder: payload.optionOrder || {},
      certificateId: null,
      certificateIssuedAt: null
    }),
    prefer: "return=representation"
  });

  return new ParticipantDocument(rows[0]);
};

const findById = (id) =>
  new ParticipantQuery(() =>
    supabaseRequest(TABLE, {
      query: {
        select: "*",
        id: `eq.${id}`,
        limit: "1"
      }
    })
  );

const findLatestByExamLinkAndAttemptKey = (examLinkId, attemptKey) =>
  new ParticipantQuery(() =>
    supabaseRequest(TABLE, {
      query: {
        select: "*",
        exam_link_id: `eq.${examLinkId}`,
        attempt_key: `eq.${attemptKey}`,
        order: "date.desc",
        limit: "1"
      }
    })
  );

const countByExamLink = async () => {
  const rows = await supabaseRequest(TABLE, {
    query: {
      select: "exam_link_id"
    }
  });

  return (Array.isArray(rows) ? rows : []).reduce((counts, row) => {
    const examLinkId = row.exam_link_id;

    if (examLinkId) {
      counts[examLinkId] = (counts[examLinkId] || 0) + 1;
    }

    return counts;
  }, {});
};

const find = (filter = {}, projection = "") =>
  new ParticipantQuery(
    () =>
      supabaseRequest(TABLE, {
        query: {
          select: "*"
        }
      }),
    {
      projection,
      expectsArray: true
    }
  );

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
  create,
  findById,
  findLatestByExamLinkAndAttemptKey,
  countByExamLink,
  find,
  deleteMany,
  RESULT_STATUS
};
