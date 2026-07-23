/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testRegex: ".*\\.e2e-spec\\.ts$",
  moduleNameMapper: {
    "^@safestock/shared-types$": "<rootDir>/../../../packages/shared-types/src/index.ts",
  },
  // E2E bootstrap app + Postgres thật → cho nhiều thời gian hơn unit.
  testTimeout: 30000,
};
