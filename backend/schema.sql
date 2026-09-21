CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  enabled INTEGER NOT NULL DEFAULT 1,
  day_utc TEXT NOT NULL DEFAULT '',
  calls_today INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('topup','request','refund')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ledger_player ON ledger(player_id, created_at);
CREATE TRIGGER IF NOT EXISTS apply_topup AFTER INSERT ON ledger
WHEN NEW.kind = 'topup'
BEGIN
  UPDATE players SET credits = credits + NEW.delta WHERE id = NEW.player_id;
END;
