import assert from "node:assert/strict";
import test from "node:test";

import { parseDetectorVersion } from "./config.ts";

test("DETECTOR_VERSION defaults to v01 when absent", () => {
  assert.equal(parseDetectorVersion(), "v01");
  assert.equal(parseDetectorVersion(""), "v01");
});

test("DETECTOR_VERSION accepts explicit v02", () => {
  assert.equal(parseDetectorVersion("v02"), "v02");
  assert.equal(parseDetectorVersion(" V02 "), "v02");
});

test("invalid DETECTOR_VERSION falls back safely to v01", () => {
  assert.equal(parseDetectorVersion("latest"), "v01");
  assert.equal(parseDetectorVersion("v03"), "v01");
});
