# Daily Overview Claude Prompt v0.2

Mode: `daily_overview`.

Search goal:
- Summarize the UTC day's public crypto market context.
- Use relevant public sources for that UTC day.
- Include major macro, regulatory, exchange, project, or broad market context only when source-supported.
- Mention if no major public driver is found.
- Do not force a cause.
- Do not classify the whole day as Focused Cause or Likely Cause.
- Use Daily Overview labels, not Signal Event cause labels.
- Do not provide trading advice, forecasts, price targets, or recommendations.
- Return JSON only.

Suggested Daily Overview labels:
- Daily Context
- Quiet Day
- Mixed Day
- Volatile Day
- Risk-on Day
- Risk-off Day
- No Major Driver
- Claude Limited

Source tags:
- Main daily context source
- Supporting daily source
- Price check source
- Backdrop source

Rejected, low-quality, stale, conflicting, or generic root URLs must not be public.
