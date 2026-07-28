const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { readFileSync, realpathSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobileRoot = path.resolve(__dirname, "..");
const mobileRequire = createRequire(path.join(mobileRoot, "package.json"));

test("Metro uses Expo's monorepo-aware defaults", () => {
  const configPath = mobileRequire.resolve("./metro.config.js");
  delete require.cache[configPath];
  const config = mobileRequire("./metro.config.js");
  const workspaceRoot = path.resolve(mobileRoot, "../..");
  const configSource = readFileSync(
    path.join(mobileRoot, "metro.config.js"),
    "utf8",
  );

  assert.equal(
    config.server?.unstable_serverRoot,
    workspaceRoot,
    "Metro must resolve the native entry from the pnpm workspace root",
  );
  assert.doesNotMatch(
    configSource,
    /(?:nodeModulesPaths|watchFolders|disableHierarchicalLookup)\s*=/,
    "Do not override Expo's pnpm monorepo resolution manually",
  );

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  delete require.cache[configPath];
  const releaseConfig = mobileRequire("./metro.config.js");
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
  delete require.cache[configPath];

  assert.equal(
    releaseConfig.server?.unstable_serverRoot,
    mobileRoot,
    "Gradle passes ./index.js relative to the mobile app during release embedding",
  );
});

test("NetInfo and the mobile app resolve the same React instance", () => {
  const appReact = realpathSync(mobileRequire.resolve("react"));
  const netInfoEntry = mobileRequire.resolve("@react-native-community/netinfo");
  const netInfoReact = realpathSync(createRequire(netInfoEntry).resolve("react"));

  assert.equal(
    netInfoReact,
    appReact,
    `NetInfo resolved ${netInfoReact}, but the app resolved ${appReact}`,
  );
});
