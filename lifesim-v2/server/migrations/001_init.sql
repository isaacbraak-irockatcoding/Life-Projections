CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  username           TEXT NOT NULL UNIQUE,
  password_hash      TEXT NOT NULL,
  avatar             TEXT NOT NULL DEFAULT '🦊',
  recovery_code_hash TEXT DEFAULT NULL,
  created_at         INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS scenarios (
  id                        SERIAL PRIMARY KEY,
  user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL DEFAULT 'My Scenario',
  color                     TEXT NOT NULL DEFAULT '#00d4aa',
  job_id                    TEXT NOT NULL DEFAULT 'sw_eng',
  custom_s0                 DOUBLE PRECISION,
  custom_s35                DOUBLE PRECISION,
  custom_s50                DOUBLE PRECISION,
  start_age                 INTEGER NOT NULL DEFAULT 25,
  career_start_age          INTEGER NOT NULL DEFAULT 22,
  retire_age                INTEGER NOT NULL DEFAULT 65,
  save_pct                  DOUBLE PRECISION NOT NULL DEFAULT 20,
  return_rate               DOUBLE PRECISION NOT NULL DEFAULT 7,
  annual_expenses           DOUBLE PRECISION NOT NULL DEFAULT 0,
  state_code                TEXT NOT NULL DEFAULT 'none',
  le_has_rent               INTEGER NOT NULL DEFAULT 0,
  le_rent_monthly           DOUBLE PRECISION NOT NULL DEFAULT 0,
  le_pet_count              INTEGER NOT NULL DEFAULT 0,
  le_dining                 TEXT NOT NULL DEFAULT 'never',
  le_has_car                INTEGER NOT NULL DEFAULT 0,
  le_utilities_monthly      DOUBLE PRECISION NOT NULL DEFAULT 0,
  health_insurance_monthly  DOUBLE PRECISION NOT NULL DEFAULT 0,
  health_insurance_coverage TEXT NOT NULL DEFAULT 'single',
  health_insurance_plan     TEXT NOT NULL DEFAULT 'standard',
  health_insurance_enabled  INTEGER NOT NULL DEFAULT 1,
  le_housing_tier           TEXT NOT NULL DEFAULT 'modest',
  le_groceries              TEXT NOT NULL DEFAULT 'average',
  le_phone_monthly          DOUBLE PRECISION NOT NULL DEFAULT 0,
  le_healthcare_monthly     DOUBLE PRECISION NOT NULL DEFAULT 0,
  le_clothing_monthly       DOUBLE PRECISION NOT NULL DEFAULT 0,
  rent_start_age            INTEGER DEFAULT NULL,
  rent_end_age              INTEGER DEFAULT NULL,
  created_at                INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
  updated_at                INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS assets (
  id                   SERIAL PRIMARY KEY,
  scenario_id          INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  label                TEXT NOT NULL,
  value                DOUBLE PRECISION NOT NULL DEFAULT 0,
  annual_contribution  DOUBLE PRECISION NOT NULL DEFAULT 0,
  expected_return_rate DOUBLE PRECISION NOT NULL DEFAULT 7,
  start_age            INTEGER,
  event_id             INTEGER,
  created_at           INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS debts (
  id              SERIAL PRIMARY KEY,
  scenario_id     INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  label           TEXT NOT NULL,
  balance         DOUBLE PRECISION NOT NULL DEFAULT 0,
  interest_rate   DOUBLE PRECISION NOT NULL DEFAULT 5,
  monthly_payment DOUBLE PRECISION NOT NULL DEFAULT 0,
  start_age       INTEGER,
  event_id        INTEGER,
  created_at      INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id                      SERIAL PRIMARY KEY,
  scenario_id             INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  event_type              TEXT NOT NULL,
  name                    TEXT NOT NULL,
  emoji                   TEXT NOT NULL DEFAULT '📌',
  at_age                  INTEGER NOT NULL,
  one_time_cost           DOUBLE PRECISION NOT NULL DEFAULT 0,
  annual_impact           DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_years          INTEGER NOT NULL DEFAULT 1,
  color                   TEXT NOT NULL DEFAULT '#38bdf8',
  annual_cost_pct         DOUBLE PRECISION NOT NULL DEFAULT 3,
  home_value              DOUBLE PRECISION NOT NULL DEFAULT 0,
  home_appreciation_rate  DOUBLE PRECISION NOT NULL DEFAULT 3,
  mortgage_rate           DOUBLE PRECISION NOT NULL DEFAULT 7,
  mortgage_years          INTEGER NOT NULL DEFAULT 30,
  spouse_job_id           TEXT DEFAULT NULL,
  spouse_s0               DOUBLE PRECISION DEFAULT NULL,
  spouse_s35              DOUBLE PRECISION DEFAULT NULL,
  spouse_s50              DOUBLE PRECISION DEFAULT NULL,
  spouse_career_start_age INTEGER DEFAULT NULL,
  created_at              INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS careers (
  id          SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  job_id      TEXT NOT NULL DEFAULT 'sw_eng',
  custom_s0   DOUBLE PRECISION,
  custom_s35  DOUBLE PRECISION,
  custom_s50  DOUBLE PRECISION,
  start_age   INTEGER NOT NULL DEFAULT 22,
  end_age     INTEGER,
  label       TEXT,
  created_at  INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS lifestyles (
  id                    SERIAL PRIMARY KEY,
  scenario_id           INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  start_age             INTEGER NOT NULL DEFAULT 22,
  le_housing_tier       TEXT NOT NULL DEFAULT 'modest',
  le_utilities_monthly  DOUBLE PRECISION NOT NULL DEFAULT 0,
  le_groceries          TEXT NOT NULL DEFAULT 'average',
  le_dining             TEXT NOT NULL DEFAULT 'never',
  le_has_car            INTEGER NOT NULL DEFAULT 0,
  le_pet_count          INTEGER NOT NULL DEFAULT 0,
  le_phone_monthly      DOUBLE PRECISION NOT NULL DEFAULT 0,
  le_healthcare_monthly DOUBLE PRECISION NOT NULL DEFAULT 0,
  le_clothing_monthly   DOUBLE PRECISION NOT NULL DEFAULT 0,
  annual_expenses       DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS schools (
  id                 SERIAL PRIMARY KEY,
  scenario_id        INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  type               TEXT NOT NULL DEFAULT 'undergrad',
  name               TEXT NOT NULL DEFAULT '',
  tuition_annual     DOUBLE PRECISION NOT NULL DEFAULT 0,
  years              INTEGER NOT NULL DEFAULT 4,
  start_age          INTEGER NOT NULL DEFAULT 18,
  parent_pays        INTEGER NOT NULL DEFAULT 0,
  scholarship_annual DOUBLE PRECISION NOT NULL DEFAULT 0,
  scholarship_years  INTEGER NOT NULL DEFAULT 0,
  loan_id            INTEGER DEFAULT NULL,
  created_at         INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS share_links (
  id          SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
  expires_at  INTEGER
);

CREATE TABLE IF NOT EXISTS comments (
  id            SERIAL PRIMARY KEY,
  share_link_id INTEGER NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS friendships (
  id           SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
  UNIQUE(requester_id, addressee_id),
  CHECK(requester_id != addressee_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  join_code  TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS group_members (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_token TEXT,
  joined_at   INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_scenarios_user    ON scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_scenario   ON assets(scenario_id);
CREATE INDEX IF NOT EXISTS idx_debts_scenario    ON debts(scenario_id);
CREATE INDEX IF NOT EXISTS idx_events_scenario   ON events(scenario_id);
CREATE INDEX IF NOT EXISTS idx_careers_scenario  ON careers(scenario_id);
CREATE INDEX IF NOT EXISTS idx_lifestyles_scenario ON lifestyles(scenario_id);
CREATE INDEX IF NOT EXISTS idx_schools_scenario  ON schools(scenario_id);
CREATE INDEX IF NOT EXISTS idx_share_token       ON share_links(token);
CREATE INDEX IF NOT EXISTS idx_comments_link     ON comments(share_link_id);
CREATE INDEX IF NOT EXISTS idx_friends_pair      ON friendships(requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS idx_groups_owner      ON groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_group_members_g   ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_u   ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_join_code   ON groups(join_code);
