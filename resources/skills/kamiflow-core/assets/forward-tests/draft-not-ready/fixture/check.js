import assert from "node:assert/strict";
import { divide } from "./calc.js";

assert.equal(divide(8, 2), 4);
assert.throws(() => divide(5, 0), /division by zero/i);

console.log("draft-not-ready checks passed");
