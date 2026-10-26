CREATE TABLE collaboration_requests (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  requester_user_id TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all_tasks',
  schedule_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX collaboration_requests_owner_idx ON collaboration_requests (owner_user_id, status);
CREATE INDEX collaboration_requests_requester_idx ON collaboration_requests (requester_user_id, status);