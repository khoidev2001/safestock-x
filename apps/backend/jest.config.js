/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleNameMapper: {
    "^@safestock/shared-types$": "<rootDir>/../../../packages/shared-types/src/index.ts",
    "^@safestock/scenario-definitions$":
      "<rootDir>/../../../packages/scenario-definitions/src/index.ts",
  },
};
