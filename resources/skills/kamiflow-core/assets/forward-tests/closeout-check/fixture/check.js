import assert from "node:assert/strict";
import { add } from "./math.js";

assert.equal(add(2, 1), 3);
assert.equal(add(-2, 1), -1);

console.log("closeout checks passed");
