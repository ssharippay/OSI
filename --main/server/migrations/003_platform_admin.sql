CREATE TABLE platform_admins (
  user_id uuid PRIMARY KEY REFERENCES accounts(id),
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit ADD COLUMN details jsonb;
CREATE INDEX ON audit(house_id, id DESC);
