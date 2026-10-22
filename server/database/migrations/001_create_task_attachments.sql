CREATE TABLE IF NOT EXISTS task_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  uploader_id BIGINT UNSIGNED NOT NULL,
  stored_name VARCHAR(80) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(32) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_task_attachments_stored_name (stored_name),
  KEY idx_task_attachments_task_created (task_id, created_at),
  CONSTRAINT fk_task_attachments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_attachments_uploader FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
