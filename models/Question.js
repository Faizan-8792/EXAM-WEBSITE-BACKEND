const { supabaseRequest } = require("../utils/supabaseClient");

const TABLE = "questions";
const QUESTION_TYPES = {
  MCQ: "mcq",
  ONE_WORD: "one_word"
};

const normalizeQuestionType = (value) => (value === QUESTION_TYPES.ONE_WORD ? QUESTION_TYPES.ONE_WORD : QUESTION_TYPES.MCQ);

const mapQuestionFromDb = (row = {}) => ({
  _id: row.id,
  id: row.id,
  question: row.question || "",
  questionType: normalizeQuestionType(row.question_type),
  options: Array.isArray(row.options) ? row.options : [],
  correctAnswer: Number(row.correct_answer) || 0,
  correctText: row.correct_text || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapQuestionToDb = (payload = {}) => {
  const questionType = normalizeQuestionType(payload.questionType);

  return {
    question: payload.question,
    question_type: questionType,
    options: questionType === QUESTION_TYPES.MCQ ? payload.options : ["", "", "", ""],
    correct_answer: questionType === QUESTION_TYPES.MCQ ? payload.correctAnswer : 0,
    correct_text: questionType === QUESTION_TYPES.ONE_WORD ? payload.correctText : ""
  };
};

const sortQuestions = (questions, sortSpec = {}) => {
  if (sortSpec.createdAt === -1 || sortSpec.created_at === -1) {
    return questions.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  if (sortSpec.createdAt === 1 || sortSpec.created_at === 1) {
    return questions.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }

  return questions;
};

class QuestionQuery {
  constructor(loader) {
    this.loader = loader;
    this.sortSpec = {};
  }

  sort(sortSpec = {}) {
    this.sortSpec = sortSpec;
    return this;
  }

  async exec() {
    const rows = await this.loader();
    return sortQuestions(rows.map(mapQuestionFromDb), this.sortSpec);
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

const shuffle = (items) => {
  const values = [...items];

  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }

  return values;
};

const find = () =>
  new QuestionQuery(() =>
    supabaseRequest(TABLE, {
      query: {
        select: "*"
      }
    })
  );

const findByIds = async (ids = []) => {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];

  if (!uniqueIds.length) {
    return [];
  }

  const rows = await supabaseRequest(TABLE, {
    query: {
      select: "*",
      id: `in.(${uniqueIds.join(",")})`
    }
  });

  const mapped = rows.map(mapQuestionFromDb);
  const byId = new Map(mapped.map((question) => [String(question._id), question]));
  return uniqueIds.map((id) => byId.get(id)).filter(Boolean);
};

const countDocuments = async () => {
  const rows = await supabaseRequest(TABLE, {
    query: {
      select: "id"
    }
  });

  return rows.length;
};

const aggregate = async (pipeline = []) => {
  const sampleStage = pipeline.find((stage) => stage && stage.$sample);
  const size = Math.max(0, Number(sampleStage?.$sample?.size) || 0);
  const rows = await supabaseRequest(TABLE, {
    query: {
      select: "*"
    }
  });

  const questions = rows.map(mapQuestionFromDb);
  return size ? shuffle(questions).slice(0, size) : questions;
};

const create = async (payload) => {
  const rows = await supabaseRequest(TABLE, {
    method: "POST",
    body: mapQuestionToDb(payload),
    prefer: "return=representation"
  });

  return mapQuestionFromDb(rows[0]);
};

const findByIdAndUpdate = async (id, payload) => {
  const rows = await supabaseRequest(TABLE, {
    method: "PATCH",
    query: {
      id: `eq.${id}`
    },
    body: mapQuestionToDb(payload),
    prefer: "return=representation"
  });

  return rows[0] ? mapQuestionFromDb(rows[0]) : null;
};

const findByIdAndDelete = async (id) => {
  const rows = await supabaseRequest(TABLE, {
    method: "DELETE",
    query: {
      id: `eq.${id}`
    },
    prefer: "return=representation"
  });

  return rows[0] ? mapQuestionFromDb(rows[0]) : null;
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
  QUESTION_TYPES,
  find,
  findByIds,
  countDocuments,
  aggregate,
  create,
  findByIdAndUpdate,
  findByIdAndDelete,
  deleteMany
};
