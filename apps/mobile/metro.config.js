const { getDefaultConfig } = require("expo/metro-config");

// Expo SDK 52+ tự nhận diện pnpm workspace. Dev server giữ workspace root để
// Expo không nhân đôi apps/mobile trong entry URL. Gradle Windows lại truyền
// ./index.js tương đối với app khi embed release, nên release cần app root.
const config = getDefaultConfig(__dirname);
if (process.env.NODE_ENV === "production") {
  config.server.unstable_serverRoot = __dirname;
}

module.exports = config;
