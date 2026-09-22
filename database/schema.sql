CREATE DATABASE IF NOT EXISTS controlProgramaEntrenamientos;
CREATE DATABASE IF NOT EXISTS controlProgramaEntrenamientos_staging;

USE controlProgramaEntrenamientos_staging;

CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS master_catalogs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS master_catalog_values (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  catalog_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSON NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_master_value (catalog_id, code),
  CONSTRAINT fk_master_value_catalog FOREIGN KEY (catalog_id) REFERENCES master_catalogs(id)
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_user_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES master_catalog_values(id)
);

CREATE TABLE IF NOT EXISTS training_programs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  cohort VARCHAR(80) NOT NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  starts_on DATE NULL,
  ends_on DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_program_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_program_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id)
);

CREATE TABLE IF NOT EXISTS components (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  instructor_id BIGINT UNSIGNED NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_component_program FOREIGN KEY (program_id) REFERENCES training_programs(id),
  CONSTRAINT fk_component_instructor FOREIGN KEY (instructor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS topics (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  component_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  scheduled_on DATE NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_topic_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT fk_topic_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id)
);

CREATE TABLE IF NOT EXISTS holidays (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  holiday_on DATE NOT NULL,
  name VARCHAR(160) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_tenant_holiday (tenant_id, holiday_on),
  CONSTRAINT fk_holiday_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  topic_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  attendance_status_id BIGINT UNSIGNED NOT NULL,
  absence_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_attendance_topic FOREIGN KEY (topic_id) REFERENCES topics(id),
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_attendance_status FOREIGN KEY (attendance_status_id) REFERENCES master_catalog_values(id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_leave_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_leave_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id)
);

DELIMITER $$
CREATE PROCEDURE sp_system_health()
BEGIN
  SELECT 'ok' AS status, DATABASE() AS database_name;
END$$

CREATE PROCEDURE sp_authenticate_user(IN p_email VARCHAR(190), IN p_password VARCHAR(255), IN p_role VARCHAR(80))
BEGIN
  SELECT u.id, u.tenant_id, u.full_name, u.email, v.code AS role_code
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id
  WHERE u.email = p_email AND u.password_hash = p_password AND v.code = p_role AND u.is_deleted = FALSE AND u.is_active = TRUE;
END$$

CREATE PROCEDURE sp_dashboard_get(IN p_user_id BIGINT, IN p_role VARCHAR(80), IN p_tenant_id BIGINT)
BEGIN
  SELECT p_role AS role_code, p_user_id AS user_id, p_tenant_id AS tenant_id;
END$$

CREATE PROCEDURE sp_attendance_record(IN p_topic_id BIGINT, IN p_student_id BIGINT, IN p_attendance_status_id BIGINT, IN p_absence_reason VARCHAR(500), IN p_user_id BIGINT)
BEGIN
  INSERT INTO attendance (topic_id, student_id, attendance_status_id, absence_reason, created_by) VALUES (p_topic_id, p_student_id, p_attendance_status_id, p_absence_reason, p_user_id);
  SELECT LAST_INSERT_ID() AS attendance_id;
END$$
DELIMITER ;