const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");

const examRoutes = require("./routes/examRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { getDbStatus, requireDbConnection } = require("./utils/db");
const { isAllowedOrigin } = require("./utils/origins");

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX) || 4500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests. Please retry after some time."
  }
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    referrerPolicy: { policy: "no-referrer" }
  })
);

app.use((req, res, next) => {
  const origin = req.get("origin");

  if (!origin) {
    return next();
  }

  if (!isAllowedOrigin(origin)) {
    if (req.method === "OPTIONS") {
      return res.status(403).json({ message: "Origin not allowed" });
    }

    return next();
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Client-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(compression());
app.use(hpp());
app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use("/api", apiLimiter);

app.get("/", (req, res) => {
  return res.json({
    service: "Narayana Exam Backend API",
    status: "ok"
  });
});

app.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    database: getDbStatus().status
  });
});

app.use("/api/exam", requireDbConnection, examRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/*", (req, res) => {
  return res.status(404).json({ message: "API route not found" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error(error);
  return res.status(error.status || 500).json({
    message: error.message || "Internal server error"
  });
});

module.exports = app;
