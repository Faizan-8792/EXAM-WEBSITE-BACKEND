require("dotenv").config();

const app = require("./app");
const { connectDb } = require("./utils/db");
const PORT = Number(process.env.PORT) || 5000;
const PUBLIC_BACKEND_URL = String(process.env.BACKEND_PUBLIC_URL || "https://backendexamwebsite.azurewebsites.net")
  .trim()
  .replace(/\/+$/, "");

const startServer = async () => {
  const server = app.listen(PORT, () => {
    console.log(`Backend server running on ${PUBLIC_BACKEND_URL}`);
  });

  connectDb().catch((error) => {
    console.error(`Database connection unavailable: ${error.message}`);
  });

  const shutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);

    server.close(() => {
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
};

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
