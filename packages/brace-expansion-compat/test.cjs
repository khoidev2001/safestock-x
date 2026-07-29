const assert = require("node:assert/strict");
const test = require("node:test");

const expand = require(".");
const patchedPackage = require("brace-expansion-patched/package.json");

test("keeps legacy callable CJS API on top of patched brace-expansion", () => {
  assert.equal(patchedPackage.version, "5.0.8");
  assert.equal(typeof expand, "function");
  assert.equal(expand.expand, expand);
  assert.deepEqual(expand("asset-{a,b}-{1..2}"), [
    "asset-a-1",
    "asset-a-2",
    "asset-b-1",
    "asset-b-2",
  ]);
});

test("also exposes a default ESM function for modern consumers", async () => {
  const esm = await import("./index.mjs");
  assert.equal(typeof esm.default, "function");
  assert.deepEqual(esm.default("{x,y}"), ["x", "y"]);
});
