const { execFileSync } = require("child_process");
const path = require("path");

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const cacheDirectory = process.env.PUPPETEER_CACHE_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), ".cache", "puppeteer");

try {
  execFileSync(npxCommand, ["puppeteer", "browsers", "install", "chrome"], {
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
