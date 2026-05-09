const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const cacheDirectory = process.env.PUPPETEER_CACHE_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), ".cache", "puppeteer");

const getPuppeteerCliPath = () => {
  const packageRoot = path.dirname(require.resolve("puppeteer/package.json"));
  const cliCandidates = [
    path.join(packageRoot, "lib", "cjs", "puppeteer", "node", "cli.js"),
    path.join(packageRoot, "lib", "esm", "puppeteer", "node", "cli.js")
  ];

  return cliCandidates.find((candidatePath) => fs.existsSync(candidatePath));
};

try {
  const puppeteerCliPath = getPuppeteerCliPath();
  if (!puppeteerCliPath) {
    throw new Error("Puppeteer CLI file was not found in node_modules.");
  }

  execFileSync(process.execPath, [puppeteerCliPath, "browsers", "install", "chrome"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: cacheDirectory
    }
  });
} catch (error) {
  console.error(`Chrome installation failed. Certificate generation requires browser PDF rendering. ${error.message}`);
  process.exitCode = 1;
}
