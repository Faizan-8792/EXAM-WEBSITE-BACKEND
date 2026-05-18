const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");

/**
 * Resolve the default Puppeteer cache directory.
 * Checks PUPPETEER_CACHE_DIR env var first, then falls back to ~/.cache/puppeteer.
 */
const getDefaultCacheDir = () => {
  if (process.env.PUPPETEER_CACHE_DIR) {
    return process.env.PUPPETEER_CACHE_DIR;
  }

  const homeDirectory = process.env.HOME || process.env.USERPROFILE;
  return homeDirectory
    ? path.join(homeDirectory, ".cache", "puppeteer")
    : path.join(backendRoot, ".cache", "puppeteer");
};

/**
 * Locate the Puppeteer internal CLI script used for browser installation.
 * Returns the absolute path or undefined if not found.
 */
const getPuppeteerCliPath = () => {
  const packageRoot = path.dirname(require.resolve("puppeteer/package.json"));
  const candidates = [
    path.join(packageRoot, "lib", "cjs", "puppeteer", "node", "cli.js"),
    path.join(packageRoot, "lib", "esm", "puppeteer", "node", "cli.js")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
};

module.exports = {
  backendRoot,
  getDefaultCacheDir,
  getPuppeteerCliPath
};
