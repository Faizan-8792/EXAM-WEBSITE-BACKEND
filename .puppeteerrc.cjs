const { getDefaultCacheDir } = require("./utils/puppeteerPaths");

module.exports = {
  cacheDirectory: getDefaultCacheDir()
};
