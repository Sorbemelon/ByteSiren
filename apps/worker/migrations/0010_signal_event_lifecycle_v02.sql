-- Additive v0.2 Signal Event lifecycle fields.
-- These support UI-only lifecycle context such as "Reversed, Net up/down".

ALTER TABLE signal_events_v02
ADD COLUMN direction_changed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE signal_events_v02
ADD COLUMN direction_history_json TEXT NOT NULL DEFAULT '[]';
