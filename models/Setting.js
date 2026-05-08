const { DEFAULT_PASSING_MARKS, DEFAULT_TOTAL_QUESTIONS, EXAM_DURATION_MINUTES } = require("../utils/constants");
const { supabaseRequest } = require("../utils/supabaseClient");

const TABLE = "settings";
const SINGLETON_KEY = "default";

const defaultSettings = () => ({
  singleton_key: SINGLETON_KEY,
  passing_marks: DEFAULT_PASSING_MARKS,
  total_questions: DEFAULT_TOTAL_QUESTIONS,
  exam_duration_minutes: EXAM_DURATION_MINUTES,
  show_certificate_id: true
});

const numberOrDefault = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mapSettingToDb = (setting = {}) => ({
  singleton_key: setting.singletonKey || SINGLETON_KEY,
  passing_marks: numberOrDefault(setting.passingMarks, DEFAULT_PASSING_MARKS),
  total_questions: numberOrDefault(setting.totalQuestions, DEFAULT_TOTAL_QUESTIONS),
  exam_duration_minutes: numberOrDefault(setting.examDurationMinutes, EXAM_DURATION_MINUTES),
  show_certificate_id: setting.showCertificateId !== false
});

class SettingDocument {
  constructor(row = {}) {
    this.singletonKey = row.singleton_key || SINGLETON_KEY;
    this.passingMarks = numberOrDefault(row.passing_marks, DEFAULT_PASSING_MARKS);
    this.totalQuestions = numberOrDefault(row.total_questions, DEFAULT_TOTAL_QUESTIONS);
    this.examDurationMinutes = numberOrDefault(row.exam_duration_minutes, EXAM_DURATION_MINUTES);
    this.showCertificateId = row.show_certificate_id !== false;
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
        singleton_key: `eq.${this.singletonKey}`
      },
      body: mapSettingToDb(this),
      prefer: "return=representation"
    });

    if (rows[0]) {
      const updated = new SettingDocument(rows[0]);
      Object.keys(updated).forEach((key) => {
        this[key] = updated[key];
      });
    }

    return this;
  }
}

const getSingleton = async () => {
  const rows = await supabaseRequest(TABLE, {
    query: {
      select: "*",
      singleton_key: `eq.${SINGLETON_KEY}`,
      limit: "1"
    }
  });

  if (rows[0]) {
    return new SettingDocument(rows[0]);
  }

  const createdRows = await supabaseRequest(TABLE, {
    method: "POST",
    body: defaultSettings(),
    prefer: "return=representation"
  });

  return new SettingDocument(createdRows[0]);
};

module.exports = {
  getSingleton
};
