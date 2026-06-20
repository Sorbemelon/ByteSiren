# Signal Event Claude Prompt v0.2

Mode: `signal_event`.

Use the payload's exact UTC evidence window. If macro context may matter, also use the provided ET conversion.

Search goal:
- Find public context tied to the compact evidence window.
- Attempt event-specific source matching first.
- Use chart context only as descriptive evidence, not as proof of cause.
- Do not infer a news cause from chart pattern alone.
- If no time-aligned source supports a cause, return Market Backdrop or No Clear Cause.
- Do not force a cause.
- Do not provide trading advice, forecasts, price targets, or recommendations.
- Return JSON only.

Allowed public labels:
- Focused Cause
- Likely Cause
- Market Backdrop
- No Clear Cause
- Claude Limited

Source tags:
- Focused catalyst source
- Likely cause source
- Backdrop source
- Price check source

Source rules:
- Focused Cause requires at least one Focused catalyst source.
- Likely Cause requires at least one Focused catalyst source or Likely cause source.
- If only Backdrop sources remain, return Market Backdrop.
- Price check source confirms levels or movement but does not explain cause.
- Rejected, low-quality, stale, conflicting, or generic root URLs must not be public.

Return a single JSON object that matches the future brief schema.
