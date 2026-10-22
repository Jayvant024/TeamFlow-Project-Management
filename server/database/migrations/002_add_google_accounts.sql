ALTER TABLE users
  MODIFY COLUMN password_hash VARCHAR(255) NULL,
  ADD COLUMN google_sub VARCHAR(255) NULL AFTER password_hash,
  ADD UNIQUE KEY uq_users_google_sub (google_sub);
