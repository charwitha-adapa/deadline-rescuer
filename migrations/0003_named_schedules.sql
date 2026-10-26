ALTER TABLE tasks ADD COLUMN schedule_name TEXT NOT NULL DEFAULT 'My Schedule';
CREATE INDEX tasks_user_schedule_idx ON tasks (user_id, schedule_name, due_date);