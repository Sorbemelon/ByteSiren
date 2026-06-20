# ByteSiren v0.2 Detector Experiment Harness

This folder contains an offline, local-only harness for comparing the current v0.1 production detector with experimental event-window detectors.

The harness is intentionally outside the Worker and web app runtime paths. It does not change the production detector used by cron, D1 schema, routes, Claude production prompts, frontend UI, deployed configuration, or remote D1 state.

## Layout

- `src/fetch-candles.mjs` fetches public candle snapshots from a configured ByteSiren API base.
- `src/run-baseline-v01.mjs` runs the current detector modules against the offline snapshot.
- `src/run-vnext-a.mjs` runs the experimental window detector.
- `src/compare-detectors.mjs` compares baseline and vNext-A outputs.
- `src/detector-vnext-a/` contains the isolated experimental detector and tests.
- `src/detector-vnext-b/` contains the local calibration detector with publish gates.
- `src/generate-daily-overviews.mjs` creates one Daily Overview item per UTC day.
- `src/generate-day-stories.mjs` creates multi-swing Market Story context items anchored to the day they start.
- `src/build-feed-preview.mjs` creates a UTC day-post feed-preview data model.
- `src/build-feed-contract.mjs` creates a local proposal for a future grouped `GET /api/intelligence/feed` response.
- `src/build-non-public-audit.mjs` creates the local audit view for non-public detected events.
- `src/build-claude-payloads.mjs` creates local Signal Event and Daily Overview Claude payload proposals.
- `src/build-chart-preview.mjs` refreshes the local static chart-preview data bundle.
- `src/smoke-chart-preview.mjs` verifies that the chart preview has loadable local data.
- `src/compare-vnext-ab.mjs` compares vNext-A with vNext-B.
- `chart-preview/` contains the local-only chart and day-post feed inspector.
- `data/` stores the 30-day candle snapshot used by the local preview.
- `outputs/` is for generated JSON and Markdown comparison artifacts.

## Tracking Note

For the v0.2 branch, `experiments/v0.2` is temporarily tracked so the experiment workspace can be checkpointed and reverted if the experiment is not successful. The candle snapshot is public Binance market data and is kept with the experiment for reproducible local preview review.

## Commands

```bash
node experiments/v0.2/src/fetch-candles.mjs --api-base-url https://example-worker.example.workers.dev
node experiments/v0.2/src/run-baseline-v01.mjs
node experiments/v0.2/src/run-vnext-a.mjs
node experiments/v0.2/src/run-vnext-b.mjs
node experiments/v0.2/src/run-vnext-c.mjs
node experiments/v0.2/src/generate-daily-overviews.mjs
node experiments/v0.2/src/generate-day-stories.mjs
node experiments/v0.2/src/build-feed-contract.mjs
node experiments/v0.2/src/build-feed-preview.mjs
node experiments/v0.2/src/build-non-public-audit.mjs
node experiments/v0.2/src/build-claude-payloads.mjs
node experiments/v0.2/src/build-chart-preview.mjs
node experiments/v0.2/src/smoke-chart-preview.mjs
node experiments/v0.2/src/compare-detectors.mjs
node experiments/v0.2/src/compare-vnext-ab.mjs
node experiments/v0.2/src/compare-vnext-bc.mjs
node --test experiments/v0.2/src/detector-vnext-b/detector.test.mjs
node --test experiments/v0.2/src/feed-preview-v02.test.mjs
```

`API_BASE_URL` may be used instead of `--api-base-url`. There is no default API base; pass one explicitly so the script cannot accidentally call an unintended service.

The fetcher calls only public candle routes:

```text
GET /api/market/candles?symbol=BTCUSDT
GET /api/market/candles?symbol=ETHUSDT
GET /api/market/candles?symbol=BNBUSDT
GET /api/market/candles?symbol=SOLUSDT
GET /api/market/candles?symbol=XRPUSDT
```

No secrets are read or required.

## Expected Offline Flow

1. Fetch a shared snapshot into `data/candles_30d.json`.
2. Run the baseline detector to generate `outputs/baseline_v01_events.json` and `outputs/baseline_v01_summary.json`.
3. Run vNext-A to generate `outputs/vnext_a_events.json` and `outputs/vnext_a_summary.json`.
4. Run the comparison to generate `outputs/detector_comparison.json` and `outputs/detector_comparison.md`.

The experiment can be rerun against the same snapshot without changing production behavior.

## Regenerate v0.2D/R0 Preview Outputs

Run from the repo root:

```bash
node experiments/v0.2/src/run-vnext-b.mjs
node experiments/v0.2/src/run-vnext-c.mjs
node experiments/v0.2/src/generate-daily-overviews.mjs
node experiments/v0.2/src/generate-day-stories.mjs
node experiments/v0.2/src/build-feed-contract.mjs
node experiments/v0.2/src/build-feed-preview.mjs
node experiments/v0.2/src/build-non-public-audit.mjs
node experiments/v0.2/src/build-claude-payloads.mjs
node experiments/v0.2/src/build-chart-preview.mjs
node experiments/v0.2/src/smoke-chart-preview.mjs
```

## Open Chart Preview

Direct file open is supported when `chart-preview/data/preview-data.generated.js` exists:

```text
experiments/v0.2/chart-preview/index.html
```

If your browser blocks local file loading, serve the preview locally:

```bash
py -3.11 -m http.server 4177 -d experiments/v0.2/chart-preview
```

Then visit:

```text
http://localhost:4177
```

Expected visible result:

- 31 day posts
- 31 Daily Overviews
- current vNext-C public Signal Events
- current vNext-C Market Stories
- current vNext-C audit-only events
- Chart with event-window and day-window highlights

Troubleshooting:

- If the feed is empty, run `node experiments/v0.2/src/smoke-chart-preview.mjs`.
- If direct `file://` open fails or shows a data-load error, run the local server command above.
- `build-chart-preview.mjs` writes both `preview-data.generated.js` for direct file open and JSON files for local HTTP fallback.

## v0.2D Feed Preview Notes

- Public preview uses one parent post per UTC day.
- Daily Overview appears first inside each day post, followed by public Signal Events.
- vNext-C Signal Events are capped as compact evidence windows (12 bars / 3 hours max); longer related moves should appear as Market Stories instead of one stretched Signal Event.
- Market Story sections can appear between Daily Overview and Signal Events when nearby Signal Events and/or audit-only detections form a broader multi-swing context. The story layer uses an adaptive chart-context gap plus a minimum story duration and Swing Change floor, can qualify one public Signal Event plus one audit event when chart context is strong, allows audit-only sequences only when chart context is strong and no full market reset is detected, can cross UTC days, and appears on the day where its first trigger starts.
- Global controls are `Expand days` and `Collapse days`.
- Day-post controls use `+N events · Expand post` and `+N events · Collapse post`.
- Section-level details use `Show more` and `Hide`.
- Signal headline metric label is `Avg Change`.
- Daily Overview metric label is `24h Change`.
- Per-symbol evidence table uses `Window Change`, `Peak 15m`, `Volume ×`, and `Range Position`.
- Peak 15m and Lead mover remain supporting diagnostics, shown through table highlights instead of headline metrics.
- Market Story sections use `Story window` and `Swing Change` labels and do not replace the underlying Signal Event sections.

Root package scripts intentionally do not reference this folder. Run experiment commands manually from this README.
