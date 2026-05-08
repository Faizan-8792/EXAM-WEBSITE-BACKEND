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
  console.warn(`Chrome installation skipped. Certificate fallback PDF will be used if browser PDF generation is unavailable. ${error.message}`);
}
