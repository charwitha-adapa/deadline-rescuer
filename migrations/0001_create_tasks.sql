CREATE TABLE tasks (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Academic',
  due_date DATE,
  due_time TEXT,
  estimated_minutes INTEGER NOT NULL DEFAULT 60,
  importance TEXT NOT NULL DEFAULT 'Medium',
  flexibility TEXT NOT NULL DEFAULT 'Fixed deadline',
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_user_due_idx ON tasks (user_id, due_date);