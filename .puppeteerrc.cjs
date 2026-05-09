const path = require("path");

const getCacheDirectory = () => {
  if (process.env.PUPPETEER_CACHE_DIR) {
    return process.env.PUPPETEER_CACHE_DIR;
  }

  const homeDirectory = process.env.HOME || process.env.USERPROFILE;
  if (homeDirectory) {
    return path.join(homeDirectory, ".cache", "puppeteer");
  }

  return path.join(__dirname, ".cache", "puppeteer");
};

module.exports = {
  cacheDirectory: getCacheDirectory()
};
