const { execFileSync } = require("child_process");
const { getDefaultCacheDir, getPuppeteerCliPath } = require("../utils/puppeteerPaths");

const cacheDirectory = getDefaultCacheDir();

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
