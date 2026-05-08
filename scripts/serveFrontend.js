const http = require("http");
const fs = require("fs");
const path = require("path");

const FRONTEND_PORT = Number(process.env.FRONTEND_PORT) || 5500;
const frontendRoot = path.join(__dirname, "..", "..", "frontend");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp"
};

const routeMap = {
  "/": "index.html",
  "/admin": "admin.html",
  "/admin-login": "admin-login.html",
  "/exam": "exam.html",
  "/result": "result.html"
};

const resolveFilePath = (requestPath) => {
  const normalized = decodeURIComponent(requestPath.split("?")[0]);
  if (normalized.startsWith("/exam-link/")) {
    return path.join(frontendRoot, "index.html");
  }
  const mapped = routeMap[normalized] || normalized;
  const relativePath = mapped.startsWith("/") ? mapped.slice(1) : mapped;
  const fallbackPath = relativePath || "index.html";
  const absolutePath = path.join(frontendRoot, fallbackPath);

  if (!absolutePath.startsWith(frontendRoot)) {
    return null;
  }

  return absolutePath;
};

const sendFile = (res, filePath) => {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal server error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extension] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
};

const server = http.createServer((req, res) => {
  const filePath = resolveFilePath(req.url || "/");

  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (!error && stat.isFile()) {
      sendFile(res, filePath);
      return;
    }

    if (!error && stat.isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      sendFile(res, indexPath);
      return;
    }

    if (error && error.code !== "ENOENT") {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal server error");
      return;
    }

    const maybeRouteFile = routeMap[req.url || ""];
    if (maybeRouteFile) {
      sendFile(res, path.join(frontendRoot, maybeRouteFile));
      return;
    }

    sendFile(res, path.join(frontendRoot, "index.html"));
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(
      `Frontend port ${FRONTEND_PORT} is already in use. If frontend is already running, you can continue using it.`
    );
    process.exit(0);
    return;
  }

  console.error("Frontend server failed to start", error);
  process.exit(1);
});

server.listen(FRONTEND_PORT, () => {
  console.log(`Frontend server running on http://localhost:${FRONTEND_PORT}`);
});
