CREATE TABLE rate_limit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  platform VARCHAR(50),
  date DATE,
  posts_count INT DEFAULT 0,
  daily_limit INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, platform, date)
);