import assert from "node:assert/strict";
import test from "node:test";

import {
  countItems,
  renderedUniqueCountsFromEntries,
  webUrlUsageReport,
} from "./v02-real-api-smoke.mjs";

test("real API smoke counts API feed items separately from rendered DOM", () => {
  const counts = countItems({
    day_groups: [
      {
        items: [
          { item_type: "daily_overview" },
          { item_type: "market_story" },
          { item_type: "signal_event" },
        ],
      },
    ],
  });

  assert.deepEqual(counts, {
    dayPosts: 1,
    daily: 1,
    story: 1,
    signal: 1,
  });
});

test("real API smoke counts unique rendered v0.2 sections by stable IDs", () => {
  const counts = renderedUniqueCountsFromEntries([
    { dayPostId: "day_1" },
    { dayPostId: "day_1", sectionId: "daily_1", sectionType: "daily_overview" },
    { dayPostId: "day_1", sectionId: "daily_1", sectionType: "daily_overview" },
    { dayPostId: "day_1", sectionId: "story_1", sectionType: "market_story" },
    { dayPostId: "day_1", sectionId: "signal_1", sectionType: "signal_event" },
  ]);

  assert.deepEqual(counts, {
    uniqueDayPosts: 1,
    uniqueSections: 3,
    uniqueDailyOverviewSections: 1,
    uniqueMarketStorySections: 1,
    uniqueSignalEventSections: 1,
  });
});

test("real API smoke reports requested versus actual web URL", () => {
  assert.deepEqual(
    webUrlUsageReport({
      requestedWebUrl: "http://127.0.0.1:3000",
      actualWebUrl: "http://127.0.0.1:3000",
      started: false,
    }),
    {
      requested_web_url: "http://127.0.0.1:3000",
      actual_web_url: "http://127.0.0.1:3000",
      detected_port: 3000,
      server_mode: "existing_server",
      started_server: false,
    },
  );

  assert.deepEqual(
    webUrlUsageReport({
      requestedWebUrl: null,
      actualWebUrl: "http://127.0.0.1:3001",
      started: true,
    }),
    {
      requested_web_url: null,
      actual_web_url: "http://127.0.0.1:3001",
      detected_port: 3001,
      server_mode: "started_by_smoke",
      started_server: true,
    },
  );
});
