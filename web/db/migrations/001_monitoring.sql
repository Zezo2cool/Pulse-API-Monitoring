CREATE TABLE monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  url text NOT NULL CHECK (url ~* '^https?://[^[:space:]]+$'),
  method text NOT NULL DEFAULT 'GET' CHECK (method IN ('GET', 'HEAD')),
  expected_status integer NOT NULL DEFAULT 200 CHECK (expected_status BETWEEN 100 AND 599),
  interval_seconds integer NOT NULL DEFAULT 60 CHECK (interval_seconds BETWEEN 30 AND 86400),
  timeout_ms integer NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 100 AND 60000),
  enabled boolean NOT NULL DEFAULT true,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (timeout_ms <= interval_seconds * 1000)
);

CREATE TABLE check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL,
  status_code integer CHECK (status_code BETWEEN 100 AND 599),
  response_time_ms integer NOT NULL CHECK (response_time_ms >= 0),
  error_message text,
  CHECK (NOT success OR (status_code IS NOT NULL AND error_message IS NULL))
);

CREATE INDEX monitors_due_idx ON monitors (next_check_at) WHERE enabled;
CREATE INDEX check_results_history_idx ON check_results (monitor_id, checked_at DESC);
