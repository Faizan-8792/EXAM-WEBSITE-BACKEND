const getSupabaseRestUrl = () => {
  const explicitRestUrl = process.env.SUPABASE_REST_URL || process.env.SUPABASE_API_URL || "";

  if (explicitRestUrl.trim()) {
    return explicitRestUrl.trim().replace(/\/+$/, "");
  }

  const projectUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (!projectUrl) {
    return "";
  }

  return `${projectUrl}/rest/v1`;
};

const getSupabaseKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "";

const getSupabaseConfig = () => {
  const restUrl = getSupabaseRestUrl();
  const key = getSupabaseKey();

  if (!restUrl || !key) {
    throw new Error("Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (typeof fetch !== "function") {
    throw new Error("Supabase REST requires Node.js 18 or newer because global fetch is required.");
  }

  return { restUrl, key };
};

const parseSupabaseResponse = async (response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
};

const buildSupabaseErrorMessage = (payload, response) => {
  if (payload && typeof payload === "object") {
    return payload.message || payload.details || payload.hint || `Supabase request failed with status ${response.status}`;
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  return `Supabase request failed with status ${response.status}`;
};

const supabaseRequest = async (tablePath, options = {}) => {
  const { restUrl, key } = getSupabaseConfig();
  const normalizedPath = String(tablePath || "").replace(/^\/+/, "");
  const url = new URL(`${restUrl}/${normalizedPath}`);

  Object.entries(options.query || {}).forEach(([name, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(name, String(value));
    }
  });

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    ...(options.headers || {})
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const payload = await parseSupabaseResponse(response);

  if (!response.ok) {
    const error = new Error(buildSupabaseErrorMessage(payload, response));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

module.exports = {
  supabaseRequest,
  getSupabaseConfig
};
