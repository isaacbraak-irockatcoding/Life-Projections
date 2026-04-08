PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  avatar        TEXT    NOT NULL DEFAULT '🦊',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS scenarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL DEFAULT 'My Scenario',
  color         TEXT    NOT NULL DEFAULT '#00d4aa',
  job_id        TEXT    NOT NULL DEFAULT 'sw_eng',
  custom_s0     REAL,
  custom_s35    REAL,
  custom_s50    REAL,
  start_age          INTEGER NOT NULL DEFAULT 25,
  career_start_age   INTEGER NOT NULL DEFAULT 22,
  retire_age         INTEGER NOT NULL DEFAULT 65,
  save_pct        REAL    NOT NULL DEFAULT 20,
  return_rate     REAL    NOT NULL DEFAULT 7,
  annual_expenses REAL    NOT NULL DEFAULT 0,
  state_code      TEXT    NOT NULL DEFAULT 'none',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS assets (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id          INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  type                 TEXT    NOT NULL,
  label                TEXT    NOT NULL,
  value                REAL    NOT NULL DEFAULT 0,
  annual_contribution  REAL    NOT NULL DEFAULT 0,
  expected_return_rate REAL    NOT NULL DEFAULT 7,
  start_age            INTEGER,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS debts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id     INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  type            TEXT    NOT NULL,
  label           TEXT    NOT NULL,
  balance         REAL    NOT NULL DEFAULT 0,
  interest_rate   REAL    NOT NULL DEFAULT 5,
  monthly_payment REAL    NOT NULL DEFAULT 0,
  start_age       INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id    INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  event_type     TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  emoji          TEXT    NOT NULL DEFAULT '📌',
  at_age         INTEGER NOT NULL,
  one_time_cost  REAL    NOT NULL DEFAULT 0,
  annual_impact  REAL    NOT NULL DEFAULT 0,
  duration_years INTEGER NOT NULL DEFAULT 1,
  color          TEXT    NOT NULL DEFAULT '#38bdf8',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS share_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  token       TEXT    NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER
);

CREATE TABLE IF NOT EXISTS comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  share_link_id INTEGER NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT    NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS friendships (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT    NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(requester_id, addressee_id),
  CHECK(requester_id != addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_scenarios_user  ON scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_scenario ON assets(scenario_id);
CREATE INDEX IF NOT EXISTS idx_debts_scenario  ON debts(scenario_id);
CREATE INDEX IF NOT EXISTS idx_events_scenario ON events(scenario_id);
CREATE INDEX IF NOT EXISTS idx_share_token     ON share_links(token);
CREATE INDEX IF NOT EXISTS idx_comments_link   ON comments(share_link_id);
CREATE INDEX IF NOT EXISTS idx_friends_pair    ON friendships(requester_id, addressee_id);

-- Compatibility migration: add annual_expenses to existing databases (silently ignored if column exists)
ALTER TABLE scenarios ADD COLUMN annual_expenses REAL NOT NULL DEFAULT 0;
ALTER TABLE scenarios ADD COLUMN state_code TEXT NOT NULL DEFAULT 'none';
ALTER TABLE scenarios ADD COLUMN career_start_age INTEGER NOT NULL DEFAULT 22;
ALTER TABLE assets ADD COLUMN start_age INTEGER;
ALTER TABLE debts  ADD COLUMN start_age INTEGER;
ALTER TABLE assets ADD COLUMN event_id INTEGER;
ALTER TABLE events ADD COLUMN annual_cost_pct REAL NOT NULL DEFAULT 3;
ALTER TABLE events ADD COLUMN home_value REAL NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN home_appreciation_rate REAL NOT NULL DEFAULT 3;
ALTER TABLE events ADD COLUMN mortgage_rate REAL NOT NULL DEFAULT 7;
ALTER TABLE events ADD COLUMN mortgage_years INTEGER NOT NULL DEFAULT 30;
ALTER TABLE debts ADD COLUMN event_id INTEGER;
ALTER TABLE events ADD COLUMN spouse_job_id TEXT DEFAULT NULL;
ALTER TABLE events ADD COLUMN spouse_s0 REAL DEFAULT NULL;
ALTER TABLE events ADD COLUMN spouse_s35 REAL DEFAULT NULL;
ALTER TABLE events ADD COLUMN spouse_s50 REAL DEFAULT NULL;
ALTER TABLE events ADD COLUMN spouse_career_start_age INTEGER DEFAULT NULL;

-- Groups feature
CREATE TABLE IF NOT EXISTS groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  join_code  TEXT    NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS group_members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_token  TEXT,
  joined_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_groups_owner    ON groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_group_members_g ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_u ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_join_code ON groups(join_code);
