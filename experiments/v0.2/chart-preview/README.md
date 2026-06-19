# v0.2 Chart Preview

Local-only chart and day-post feed inspector for the v0.2 detector experiment.

## Refresh Data

Run from the repo root:

```bash
node experiments/v0.2/src/build-feed-contract.mjs
node experiments/v0.2/src/build-feed-preview.mjs
node experiments/v0.2/src/build-non-public-audit.mjs
node experiments/v0.2/src/build-chart-preview.mjs
node experiments/v0.2/src/smoke-chart-preview.mjs
```

The chart preview reads only local files under `experiments/v0.2/chart-preview/data/`.
It does not call the production API, Claude, D1, or any remote service.

## Open

Direct file open is supported when `data/preview-data.generated.js` exists:

```text
experiments/v0.2/chart-preview/index.html
```

If your browser blocks local file loading, serve the folder locally:

```bash
py -3.11 -m http.server 4177 -d experiments/v0.2/chart-preview
```

Then visit:

```text
http://localhost:4177
```

If the feed is empty, run:

```bash
node experiments/v0.2/src/smoke-chart-preview.mjs
```

## Review Modes

- Public feed: 31 Daily Overviews plus public signal events.
- Audit events: non-public detected events only.
- Expand days and Collapse days mirror the proposed parent day-post controls.
- Show more and Hide expand details inside one Daily Overview or Signal Event section.
