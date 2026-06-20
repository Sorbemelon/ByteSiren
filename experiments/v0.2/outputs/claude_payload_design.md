# v0.2 Claude Payload Design

This is a local-only proposal for future prompt inputs. It does not change the production Claude prompt or call Claude.

Claude is designed for two future feed modes only: Signal Event and Daily Overview. Market Story is deterministic-only.

## Signal Event Payload

- Mode: `signal_event`.
- Uses Claude.
- Compact evidence-window context.
- Event-specific source search.
- Includes UTC date/time, evidence window start/end, direction, Signals, Avg Change, event strength, Range Position, per-symbol Window Change, macro alignment, source route hints, and suggested search queries.
- Includes chart context fields: chart_context_label, event_story_type, trend_context, momentum_context, volatility_context, event_range_context, chart_context_reasons, and chart_context_warnings.
- Includes table-highlight metadata for lead mover and strongest Peak 15m diagnostics.
- Chart context is descriptive market structure, not trading advice or cause proof.
- Range Position is not support/resistance advice.
- Claude should use chart context to decide search route, but must not infer cause from chart context alone.
- If no source supports a cause, return No Clear Cause or Market Backdrop instead of forcing a narrative.
- Peak 15m and lead mover are supporting diagnostics, not the main event headline.
- Main event evidence is the evidence window, Avg Change, Signals, and Range Position.
- Claude should classify the signal as Focused Cause, Likely Cause, Market Backdrop, No Clear Cause, or Claude Limited.
- Source tags should map to Focused catalyst source, Likely cause source, Backdrop source, and Price check source.
- Focused Cause requires at least one Focused catalyst source.
- Likely Cause requires at least one Focused catalyst source or Likely cause source.
- If only Backdrop sources remain, status should become Market Backdrop.
- Price check source confirms levels/move but does not explain cause.
- Rejected, low-quality, stale, conflicting, or generic root URLs must not be public.
- Claude must not provide trading advice or return non-JSON prose.

Current local payload count: 23

## Daily Overview Payload

- Mode: `daily_overview`.
- Uses Claude.
- Full UTC-day context.
- Includes UTC date, 24h Change, market tone, notable symbols, daily range, same-day Signal Event IDs, Market Story IDs for the day, audit-event count, and source query hints.
- Claude should summarize the day's market context using relevant public sources.
- Daily Overview labels are separate from Signal Event labels.
- Do not classify the Daily Overview itself with Focused Cause or Likely Cause.
- Suggested labels: Daily Context, Quiet Day, Mixed Day, Volatile Day, Risk-on Day, Risk-off Day, No Major Driver, Claude Limited.
- Source tags should map to Main daily context source, Supporting daily source, Price check source, and Backdrop source.
- Claude must not provide trading advice or return non-JSON prose.

Current local payload count: 31

## Market Story

- Mode: deterministic chart-pattern context only.
- Does NOT use Claude.
- Does NOT have Claude status, Claude source tags, source placeholders, or a Claude payload.
- Standalone feed section.
- Does not nest Signal Event cards.
- Supports broader chart-pattern context around Signal Events and audit-only detections.
- Uses deterministic fields such as Story window, Swing Change, Pattern, Range/trend/momentum/volatility context, and decision reasons.
- It can appear publicly only when the existing Market Story criteria pass.
- Daily Overview already covers day-level Claude context, so Market Story should not ask Claude for another narrative.

## Daily Overview Claude Usage Model

- Initial 30-day backfill: generate a Claude Daily Overview for every UTC day in the visible window.
- Ongoing production: generate one Claude Daily Overview after each UTC day closes.
- Suggested schedule: after 00:30 UTC, or after daily cleanup if that creates a cleaner operational sequence.
- Daily Overview should be included in the same future `GET /api/intelligence/feed` endpoint.
- Daily Overview should not replace Signal Events.
- Signal Event and Daily Overview should use different labels and different prompt modes.
- Market Story remains deterministic and is not part of the Claude usage model.

## Output Expectations

- Return JSON only.
- Preserve source links separately from generated summaries.
- Keep source claims source-backed.
- Use No Clear Cause or market context language when no specific cause is supported.
- Avoid trading/advice wording.
