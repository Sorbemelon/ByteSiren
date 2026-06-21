import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CLAUDE_CATCHUP_LIMIT,
  MAX_CLAUDE_CATCHUP_LIMIT,
  parseBooleanFlag,
  parseClaudeCatchupLimit,
  parseDetectorVersion,
  parseFeedVersion,
} from "./config.ts";

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

test("FEED_VERSION defaults to v01 when absent or invalid", () => {
  assert.equal(parseFeedVersion(), "v01");
  assert.equal(parseFeedVersion(""), "v01");
  assert.equal(parseFeedVersion("latest"), "v01");
});

test("FEED_VERSION accepts explicit v02", () => {
  assert.equal(parseFeedVersion("v02"), "v02");
  assert.equal(parseFeedVersion(" V02 "), "v02");
});

test("FEED_VERSION does not affect detector version behavior", () => {
  assert.equal(parseFeedVersion("v02"), "v02");
  assert.equal(parseDetectorVersion(), "v01");
});

test("ENABLE_MARKET_STORIES defaults false when absent or invalid", () => {
  assert.equal(parseBooleanFlag(), false);
  assert.equal(parseBooleanFlag(""), false);
  assert.equal(parseBooleanFlag("maybe"), false);
});

test("ENABLE_MARKET_STORIES accepts explicit true values", () => {
  assert.equal(parseBooleanFlag("true"), true);
  assert.equal(parseBooleanFlag(" TRUE "), true);
  assert.equal(parseBooleanFlag("1"), true);
  assert.equal(parseBooleanFlag("yes"), true);
  assert.equal(parseBooleanFlag("on"), true);
});

test("DETECTOR_VERSION=v02 alone does not imply Market Stories", () => {
  assert.equal(parseDetectorVersion("v02"), "v02");
  assert.equal(parseBooleanFlag(undefined), false);
});

test("ENABLE_DAILY_OVERVIEWS defaults false and accepts explicit true values", () => {
  assert.equal(parseBooleanFlag(undefined), false);
  assert.equal(parseBooleanFlag(""), false);
  assert.equal(parseBooleanFlag("invalid"), false);
  assert.equal(parseBooleanFlag("true"), true);
  assert.equal(parseBooleanFlag("1"), true);
});

test("v0.2 Claude flags default false and accept explicit true values", () => {
  assert.equal(parseBooleanFlag(undefined), false);
  assert.equal(parseBooleanFlag("false"), false);
  assert.equal(parseBooleanFlag("true"), true);
  assert.equal(parseBooleanFlag("on"), true);
});

test("CLAUDE_CATCHUP_LIMIT uses a bounded safe default", () => {
  assert.equal(parseClaudeCatchupLimit(), DEFAULT_CLAUDE_CATCHUP_LIMIT);
  assert.equal(parseClaudeCatchupLimit(""), DEFAULT_CLAUDE_CATCHUP_LIMIT);
  assert.equal(parseClaudeCatchupLimit("abc"), DEFAULT_CLAUDE_CATCHUP_LIMIT);
  assert.equal(parseClaudeCatchupLimit("0"), DEFAULT_CLAUDE_CATCHUP_LIMIT);
  assert.equal(parseClaudeCatchupLimit("3"), 3);
  assert.equal(parseClaudeCatchupLimit("99"), MAX_CLAUDE_CATCHUP_LIMIT);
});
