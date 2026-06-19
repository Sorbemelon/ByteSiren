# v0.2 Claude Payload Design

This is a local-only proposal for future prompt inputs. It does not change the production Claude prompt or call Claude.

## Signal Event Payload

- Mode: `signal_event`.
- Includes UTC date/time, evidence window start/end, direction, signals count, Avg Change, signal strength, Range Position, per-symbol Window Change, macro alignment, and source route hints.
- Includes table highlight metadata for lead mover and strongest Peak 15m diagnostics.
- Peak 15m and lead mover are supporting diagnostics, not the main event headline.
- Main event evidence is the evidence window, Avg Change, Signals, and Range Position.
- Claude should not over-focus on one 15-minute candle unless the event is macro-aligned or a sharp impulse.
- Claude should classify the signal as Focused Cause, Likely Cause, Market Backdrop, No Clear Cause, or Claude Limited.
- Source tags should map to Focused catalyst source, Likely cause source, Backdrop source, and Price check source.
- Claude must not force a cause, provide trading advice, or return non-JSON prose.

Current local payload count: 14

## Daily Overview Payload

- Mode: `daily_overview`.
- Includes UTC date, 24h Change, market tone, notable symbols, daily range, same-day signal events, and source query hints.
- Claude should summarize the day's market context using relevant public sources.
- Daily Overview labels are separate from Signal Event labels.
- Do not classify the Daily Overview itself with Focused Cause or Likely Cause unless referring to a specific included Signal Event.
- Claude must not provide trading advice or return non-JSON prose.

Current local payload count: 31

## Daily Overview Claude Usage Model

- Initial 30-day backfill: generate a Claude Daily Overview for every UTC day in the visible window.
- Ongoing production: generate one Claude Daily Overview after each UTC day closes.
- Suggested schedule: after 00:30 UTC, or after daily cleanup if that creates a cleaner operational sequence.
- Daily Overview should be included in the same future `GET /api/intelligence/feed` endpoint.
- Daily Overview should not replace Signal Events.
- Signal Event and Daily Overview should use different labels and different prompt modes.

## Output Expectations

- Return JSON only.
- Preserve source links separately from generated summaries.
- Keep source claims source-backed.
- Use No Clear Cause or market context language when no specific cause is supported.
- Avoid trading/advice wording.
