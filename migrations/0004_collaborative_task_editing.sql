ALTER TABLE tasks ADD COLUMN created_by_user_id TEXT;
UPDATE tasks SET created_by_user_id = user_id WHERE created_by_user_id IS NULL;
-- Keep creator ID nullable for legacy rows; new API inserts always populate it.
ALTER TABLE tasks ADD COLUMN updated_by_user_id TEXT;
UPDATE tasks SET updated_by_user_id = user_id WHERE updated_by_user_id IS NULL;
-- Keep updater ID nullable for legacy rows; new API writes always populate it.
ALTER TABLE tasks ADD COLUMN created_by_email TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN updated_by_email TEXT NOT NULL DEFAULT '';
UPDATE tasks t SET created_by_email = COALESCE((SELECT u.email FROM users u WHERE u.id=t.created_by_user_id LIMIT 1), t.created_by_user_id, t.user_id, 'unknown');
UPDATE tasks t SET updated_by_email = COALESCE((SELECT u.email FROM users u WHERE u.id=t.updated_by_user_id LIMIT 1), t.updated_by_user_id, t.user_id, 'unknown');
ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX tasks_creator_request_key_idx ON tasks (created_by_user_id, request_key) WHERE request_key IS NOT NULL;
CREATE INDEX tasks_created_by_idx ON tasks (created_by_user_id);