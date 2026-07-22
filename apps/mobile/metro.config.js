// Metro config cho monorepo pnpm — Expo mặc định không thấy node_modules ở root
// và không theo được symlink của pnpm. Ta: (1) watch cả workspace root,
// (2) cho resolver tìm module ở cả mobile lẫn root, (3) bật symlink.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
