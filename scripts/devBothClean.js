const { spawn } = require("child_process");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const backendPort = Number(process.env.PORT) || 5000;
const frontendPort = Number(process.env.FRONTEND_PORT) || 5500;
const children = [];
const printed = {
  backend: false,
  frontend: false
};

const printOnce = (name, message) => {
  if (printed[name]) {
    return;
  }

  printed[name] = true;
  console.log(message);
};

const stopChildren = () => {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  });
};

const handleLine = (name, line) => {
  if (!line) {
    return;
  }

  if (name === "frontend") {
    if (line.includes("Frontend server running") || line.includes("Frontend port")) {
      printOnce("frontend", `Frontend server running on http://localhost:${frontendPort}`);
    }
    return;
  }

  if (line.includes("Backend server running") || line.includes("Narayana Exam System is running")) {
    printOnce("backend", `Backend server running on http://localhost:${backendPort}`);
  }
};

const pipeLines = (name, stream) => {
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    lines.forEach((line) => handleLine(name, line.trim()));
  });

  stream.on("end", () => {
    if (buffer) {
      handleLine(name, buffer.trim());
    }
  });
};

const startChild = (name, args) => {
  const child = spawn(process.execPath, args, {
    cwd: backendRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  children.push(child);
  pipeLines(name, child.stdout);
  pipeLines(name, child.stderr);

  child.on("exit", (code, signal) => {
    if (signal || code === 0) {
      return;
    }

    if (name === "backend" && !printed.backend) {
      console.error("Backend failed to start. Please check Supabase configuration and server logs.");
    }

    if (name === "frontend" && !printed.frontend) {
      console.error("Frontend failed to start. Please check frontend port settings.");
    }

    stopChildren();
    process.exitCode = code || 1;
  });
};

process.on("SIGINT", () => {
  stopChildren();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopChildren();
  process.exit(0);
});

startChild("backend", ["server.js"]);
startChild("frontend", [path.join("scripts", "serveFrontend.js")]);
