"use strict";

const patched = require("brace-expansion-patched");

/**
 * Compatibility façade for legacy minimatch/glob consumers which expect
 * `require("brace-expansion")` to be callable. The implementation remains
 * the patched 5.0.8 package, including its expansion-length cap.
 */
module.exports = patched.expand;
Object.assign(module.exports, patched);
