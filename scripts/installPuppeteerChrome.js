const { execFileSync } = require("child_process");

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

try {
  execFileSync(npxCommand, ["puppeteer", "browsers", "install", "chrome"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || `${process.cwd()}/.cache/puppeteer`
    }
  });
} catch (error) {
  console.warn(`Chrome installation skipped. Certificate generation requires browser PDF rendering. ${error.message}`);
}
