CREATE DATABASE IF NOT EXISTS controlProgramaEntrenamientos;
CREATE DATABASE IF NOT EXISTS controlProgramaEntrenamientos_staging;

USE controlProgramaEntrenamientos_staging;

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

CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  contact_name VARCHAR(160) NULL,
  contact_email VARCHAR(190) NULL,
  timezone VARCHAR(60) NOT NULL DEFAULT 'America/Lima',
  logo_path VARCHAR(255) NULL,
  brand_color VARCHAR(7) NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_tenant_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id)
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
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

CREATE TABLE IF NOT EXISTS login_audit (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  tenant_id BIGINT UNSIGNED NULL,
  email_attempted VARCHAR(190) NOT NULL,
  role_attempted VARCHAR(80) NULL,
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(120) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_login_audit_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_login_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS training_programs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  cohort VARCHAR(80) NOT NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  modality_id BIGINT UNSIGNED NULL,
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
  CONSTRAINT fk_program_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_program_modality FOREIGN KEY (modality_id) REFERENCES master_catalog_values(id)
);

CREATE TABLE IF NOT EXISTS program_enrollments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_program_student (program_id, student_id),
  CONSTRAINT fk_program_enrollment_program FOREIGN KEY (program_id) REFERENCES training_programs(id),
  CONSTRAINT fk_program_enrollment_student FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS components (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_component_program FOREIGN KEY (program_id) REFERENCES training_programs(id),
  CONSTRAINT fk_component_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id)
);

-- Un componente puede dictarse en paralelo a traves de varios grupos (misma
-- malla/temario, instructor y horario propios, alumnos propios, avance
-- independiente). El instructor y el horario viven aqui, no en components.
CREATE TABLE IF NOT EXISTS component_groups (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  component_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  instructor_id BIGINT UNSIGNED NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_group_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT fk_group_instructor FOREIGN KEY (instructor_id) REFERENCES users(id),
  CONSTRAINT fk_group_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id)
);

-- Horario semanal recurrente de un grupo (0=domingo..6=sabado, estilo
-- Date.getDay() de JS). Reemplaza al horario por programa: cada grupo tiene
-- el suyo, por eso dos componentes distintos pueden compartir dia/hora
-- siempre que sean instructores distintos (esa regla se valida en el SP).
CREATE TABLE IF NOT EXISTS component_group_schedule_days (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_group_weekday (group_id, weekday),
  CONSTRAINT fk_group_schedule_day_group FOREIGN KEY (group_id) REFERENCES component_groups(id),
  CONSTRAINT chk_group_schedule_day_weekday CHECK (weekday BETWEEN 0 AND 6)
);

-- group_enrollments NO se crea aqui arriba: en una base existente todavia
-- se llama component_enrollments, y crear la tabla nueva de antemano le
-- ganaria el nombre al RENAME que hace la migracion mas abajo. La crea el
-- procedimiento de migracion, en cualquiera de los dos casos.

CREATE TABLE IF NOT EXISTS topics (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  scheduled_on DATE NULL,
  actual_date DATE NULL,
  duration_minutes INT UNSIGNED NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_topic_group FOREIGN KEY (group_id) REFERENCES component_groups(id),
  CONSTRAINT fk_topic_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id)
);

-- Invitaciones: los usuarios se crean SIN contrasena y la crean ellos con
-- un enlace personal de un solo uso. Se guarda solo el hash (sha256) del
-- token; el token en claro viaja una sola vez en el enlace. Tambien sirve
-- para que alguien que perdio el acceso cree una contrasena nueva.
CREATE TABLE IF NOT EXISTS user_invitations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_user_invitation_token (token_hash),
  KEY ix_user_invitations_user (user_id),
  CONSTRAINT fk_user_invitation_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_invitation_creator FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Preinscripcion publica a un programa (formulario de su web publica).
-- No es un usuario todavia: al CONFIRMARLA el admin se crea (o reutiliza)
-- la cuenta del alumno y se inscribe en el programa (student_id).
CREATE TABLE IF NOT EXISTS pre_enrollments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  corporate_email VARCHAR(190) NULL,
  document_type_id BIGINT UNSIGNED NOT NULL,
  document_number VARCHAR(40) NOT NULL,
  country VARCHAR(80) NOT NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NULL,
  admin_comments VARCHAR(500) NULL,
  ip_address VARCHAR(64) NULL,
  resolved_at DATETIME NULL,
  resolved_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  KEY ix_pre_enrollments_program (program_id, status_id),
  KEY ix_pre_enrollments_email (email),
  CONSTRAINT fk_pre_enrollment_program FOREIGN KEY (program_id) REFERENCES training_programs(id),
  CONSTRAINT fk_pre_enrollment_doc_type FOREIGN KEY (document_type_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_pre_enrollment_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_pre_enrollment_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_pre_enrollment_resolver FOREIGN KEY (resolved_by) REFERENCES users(id)
);

-- Material didactico de un componente: un ZIP (HTML + assets) preparado
-- fuera de la plataforma y descomprimido en
-- UPLOADS_DIR/materials/components/<component_id>/<folder>. Solo una
-- version vigente por componente (subir otra da de baja la anterior).
-- tema-NN.html corresponde al tema NN (por sort_order) de CADA grupo del
-- componente; soluciones/ nunca se sirve a alumnos.
CREATE TABLE IF NOT EXISTS component_materials (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  component_id BIGINT UNSIGNED NOT NULL,
  folder VARCHAR(64) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  topic_file_count INT UNSIGNED NOT NULL,
  solution_file_count INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  KEY ix_component_materials_component (component_id, is_deleted),
  CONSTRAINT fk_component_material_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT fk_component_material_creator FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS holidays (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  holiday_on DATE NOT NULL,
  name VARCHAR(160) NOT NULL,
  type_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_tenant_holiday (tenant_id, holiday_on),
  CONSTRAINT fk_holiday_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_holiday_type FOREIGN KEY (type_id) REFERENCES master_catalog_values(id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  topic_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  attendance_status_id BIGINT UNSIGNED NOT NULL,
  reason_id BIGINT UNSIGNED NULL,
  observations VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_attendance_topic_student (topic_id, student_id),
  CONSTRAINT fk_attendance_topic FOREIGN KEY (topic_id) REFERENCES topics(id),
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_attendance_status FOREIGN KEY (attendance_status_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_attendance_reason FOREIGN KEY (reason_id) REFERENCES master_catalog_values(id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason VARCHAR(500) NOT NULL,
  leave_type_id BIGINT UNSIGNED NULL,
  evidence_url VARCHAR(500) NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  admin_comments VARCHAR(500) NULL,
  resolved_at DATETIME NULL,
  resolved_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_leave_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_leave_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_leave_type FOREIGN KEY (leave_type_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_leave_resolver FOREIGN KEY (resolved_by) REFERENCES users(id)
);

-- source_type/source_id identifican la entidad que origino la alerta (p.ej.
-- 'topic'/123) para poder evitar duplicados mientras siga abierta.
CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  type_id BIGINT UNSIGNED NOT NULL,
  priority_id BIGINT UNSIGNED NOT NULL,
  recipient_user_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(1000) NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(40) NULL,
  source_id BIGINT UNSIGNED NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  read_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_alert_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_alert_type FOREIGN KEY (type_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_alert_priority FOREIGN KEY (priority_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_alert_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_alert_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id),
  CONSTRAINT fk_alert_reader FOREIGN KEY (read_by) REFERENCES users(id),
  INDEX idx_alert_source (type_id, source_type, source_id)
);

-- Reaccion del alumno a un tema ya dictado: satisfaccion 1..5 y si quiere
-- que se repita. Una por alumno y tema (se puede cambiar).
CREATE TABLE IF NOT EXISTS topic_reactions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  topic_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  satisfaction TINYINT UNSIGNED NULL,
  wants_repeat BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY uq_reaction_topic_student (topic_id, student_id),
  CONSTRAINT fk_reaction_topic FOREIGN KEY (topic_id) REFERENCES topics(id),
  CONSTRAINT fk_reaction_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT chk_reaction_satisfaction CHECK (satisfaction IS NULL OR satisfaction BETWEEN 1 AND 5)
);

-- Comentario corto (500) del alumno sobre un tema, un curso (componente)
-- o un profesor. Se guarda todo el contexto (grupo, componente, profesor
-- de ese momento) para los reportes. Lo lee el admin.
CREATE TABLE IF NOT EXISTS student_feedback (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  topic_id BIGINT UNSIGNED NULL,
  group_id BIGINT UNSIGNED NULL,
  component_id BIGINT UNSIGNED NULL,
  instructor_id BIGINT UNSIGNED NULL,
  message VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_feedback_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_feedback_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_feedback_topic FOREIGN KEY (topic_id) REFERENCES topics(id),
  CONSTRAINT fk_feedback_group FOREIGN KEY (group_id) REFERENCES component_groups(id),
  CONSTRAINT fk_feedback_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT fk_feedback_instructor FOREIGN KEY (instructor_id) REFERENCES users(id),
  CONSTRAINT chk_feedback_target CHECK (target_type IN ('topic', 'component', 'instructor')),
  INDEX idx_feedback_student_day (student_id, created_at)
);

-- Inasistencia de un profesor a una clase. notified_at = cuando aviso (el
-- propio profesor desde la app, o la fecha que anota el admin); NULL = no
-- aviso. La justificacion la resuelve el admin. Con esto se mide si avisa
-- con anticipacion o falta sin avisar y justifica despues.
CREATE TABLE IF NOT EXISTS instructor_absences (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  instructor_id BIGINT UNSIGNED NOT NULL,
  topic_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  absence_on DATE NOT NULL,
  reason VARCHAR(500) NOT NULL,
  notified_at DATETIME NULL,
  source VARCHAR(20) NOT NULL,
  justification VARCHAR(20) NOT NULL DEFAULT 'pending',
  justification_note VARCHAR(500) NULL,
  resolved_at DATETIME NULL,
  resolved_by BIGINT UNSIGNED NULL,
  substitute_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_iabs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_iabs_instructor FOREIGN KEY (instructor_id) REFERENCES users(id),
  CONSTRAINT fk_iabs_topic FOREIGN KEY (topic_id) REFERENCES topics(id),
  CONSTRAINT fk_iabs_group FOREIGN KEY (group_id) REFERENCES component_groups(id),
  CONSTRAINT fk_iabs_substitute FOREIGN KEY (substitute_id) REFERENCES users(id),
  CONSTRAINT chk_iabs_source CHECK (source IN ('instructor', 'admin')),
  CONSTRAINT chk_iabs_justification CHECK (justification IN ('pending', 'justified', 'unjustified'))
);

-- Historial de cambios de profesor de un grupo (renuncia, reasignacion...).
-- Lo registra sp_component_groups_update cuando el grupo ya tenia profesor.
CREATE TABLE IF NOT EXISTS instructor_changes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  previous_instructor_id BIGINT UNSIGNED NOT NULL,
  new_instructor_id BIGINT UNSIGNED NULL,
  reason_code VARCHAR(30) NOT NULL,
  note VARCHAR(500) NULL,
  effective_on DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  CONSTRAINT fk_ichg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_ichg_group FOREIGN KEY (group_id) REFERENCES component_groups(id),
  CONSTRAINT fk_ichg_previous FOREIGN KEY (previous_instructor_id) REFERENCES users(id),
  CONSTRAINT fk_ichg_new FOREIGN KEY (new_instructor_id) REFERENCES users(id),
  CONSTRAINT chk_ichg_reason CHECK (reason_code IN ('resignation', 'absences', 'reassignment', 'performance', 'personal', 'other'))
);

-- "Olvide mi clave": sin servicio de correo, la solicitud le llega al
-- admin, que genera un enlace de un solo uso (user_invitations). user_id
-- NULL = el correo no existe (se guarda igual para limitar abuso por IP).
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  tenant_id BIGINT UNSIGNED NULL,
  email VARCHAR(190) NOT NULL,
  ip_address VARCHAR(64) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  resolved_by BIGINT UNSIGNED NULL,
  CONSTRAINT fk_pwreset_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_pwreset_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT chk_pwreset_status CHECK (status IN ('pending', 'resolved', 'dismissed')),
  INDEX idx_pwreset_ip (ip_address, created_at)
);

-- Disponibilidad semanal de cada profesor (0=domingo..6=sabado). La deja
-- el propio profesor o el admin; el generador de horarios elige de aqui
-- los dias y horas de cada grupo.
CREATE TABLE IF NOT EXISTS instructor_availability (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  instructor_id BIGINT UNSIGNED NOT NULL,
  program_id BIGINT UNSIGNED NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  CONSTRAINT fk_avail_instructor FOREIGN KEY (instructor_id) REFERENCES users(id),
  CONSTRAINT chk_avail_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT chk_avail_times CHECK (start_time < end_time),
  INDEX idx_avail_instructor (instructor_id),
  INDEX idx_avail_program (program_id, instructor_id)
);

-- Franjas de clase de un programa (p.ej. lun-vie 18:30-20:00 y 20:30-22:00).
-- Si el programa tiene franjas, la disponibilidad de los profesores y las
-- clases que arma el generador solo caen dentro de ellas.
CREATE TABLE IF NOT EXISTS program_schedule_windows (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  CONSTRAINT fk_pwin_program FOREIGN KEY (program_id) REFERENCES training_programs(id),
  CONSTRAINT chk_pwin_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT chk_pwin_times CHECK (start_time < end_time),
  INDEX idx_pwin_program (program_id, weekday)
);

-- Incidencias, observaciones y mejoras que reporta cualquier usuario, con
-- la captura de la pantalla desde donde reporta y una imagen opcional
-- (archivos privados en el volumen). Las atiende el admin del tenant o el
-- super admin; la conversacion vive en support_ticket_messages.
CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  reporter_id BIGINT UNSIGNED NOT NULL,
  ticket_type VARCHAR(20) NOT NULL,
  title VARCHAR(140) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  section VARCHAR(80) NULL,
  page_url VARCHAR(300) NULL,
  user_agent VARCHAR(300) NULL,
  viewport VARCHAR(30) NULL,
  screenshot_path VARCHAR(255) NULL,
  image_path VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  CONSTRAINT fk_ticket_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_ticket_reporter FOREIGN KEY (reporter_id) REFERENCES users(id),
  CONSTRAINT chk_ticket_type CHECK (ticket_type IN ('incident', 'observation', 'improvement')),
  CONSTRAINT chk_ticket_status CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'))
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ticket_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  message VARCHAR(2000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_msg_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id),
  CONSTRAINT fk_ticket_msg_author FOREIGN KEY (author_id) REFERENCES users(id)
);

-- Reportes generados con IA a partir de los comentarios de los alumnos.
-- filters y content son JSON; content guarda la respuesta estructurada.
CREATE TABLE IF NOT EXISTS ai_reports (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  filters JSON NULL,
  model VARCHAR(80) NOT NULL,
  comments_count INT NOT NULL DEFAULT 0,
  content JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  CONSTRAINT fk_ai_report_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_ai_report_author FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Materiales de una clase: archivos (privados, en el volumen) o links que
-- deja el profesor o el admin; los alumnos inscritos los ven y descargan.
CREATE TABLE IF NOT EXISTS topic_resources (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  topic_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(10) NOT NULL,
  title VARCHAR(200) NOT NULL,
  url VARCHAR(500) NULL,
  file_path VARCHAR(255) NULL,
  original_name VARCHAR(255) NULL,
  size_bytes INT UNSIGNED NULL,
  mime_type VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_topic_resource_topic FOREIGN KEY (topic_id) REFERENCES topics(id),
  CONSTRAINT fk_topic_resource_author FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_topic_resource_kind CHECK (kind IN ('file', 'link')),
  INDEX idx_topic_resource_topic (topic_id)
);

-- Generacion automatica de material con IA: un trabajo asincrono por
-- componente (todos sus temas o algunos). topics guarda el estado de cada
-- tema [{numero, titulo, status, errors}] y options lo que eligio el admin.
CREATE TABLE IF NOT EXISTS material_jobs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  component_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  topics JSON NOT NULL,
  options JSON NULL,
  total INT NOT NULL DEFAULT 0,
  done_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  model VARCHAR(80) NULL,
  error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  started_at DATETIME NULL,
  updated_at DATETIME NULL,
  finished_at DATETIME NULL,
  CONSTRAINT fk_material_job_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_material_job_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT fk_material_job_author FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_material_job_status CHECK (status IN ('queued', 'running', 'done', 'partial', 'failed', 'interrupted')),
  INDEX idx_material_job_component (component_id, created_at)
);

-- Programas de induccion (a ritmo propio): cada componente es una etapa con
-- pasos (video, lectura, cuestionario calificado, tarea, sesion en vivo por
-- Teams/Meet con scheduled_at). Los obligatorios
-- definen si la persona cumplio su induccion.
CREATE TABLE IF NOT EXISTS induction_steps (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  component_id BIGINT UNSIGNED NOT NULL,
  position INT NOT NULL DEFAULT 0,
  step_type VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(2000) NULL,
  url VARCHAR(500) NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  min_score TINYINT UNSIGNED NOT NULL DEFAULT 70,
  quiz JSON NULL,
  est_minutes SMALLINT UNSIGNED NULL,
  scheduled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_istep_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT chk_istep_type CHECK (step_type IN ('video', 'reading', 'quiz', 'task', 'meeting')),
  CONSTRAINT chk_istep_score CHECK (min_score BETWEEN 0 AND 100),
  INDEX idx_istep_component (component_id, position)
);

-- Avance de cada alumno en cada paso. score = mejor nota (0-100) de los
-- cuestionarios; last_score, la del ultimo intento.
CREATE TABLE IF NOT EXISTS induction_progress (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  step_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL,
  score DECIMAL(5,2) NULL,
  last_score DECIMAL(5,2) NULL,
  attempts INT NOT NULL DEFAULT 0,
  answers JSON NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  updated_at DATETIME NULL,
  UNIQUE KEY uq_iprogress (step_id, student_id),
  CONSTRAINT fk_iprogress_step FOREIGN KEY (step_id) REFERENCES induction_steps(id),
  CONSTRAINT fk_iprogress_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT chk_iprogress_status CHECK (status IN ('started', 'completed', 'failed'))
);

-- ===================================================================
-- Maestro de maestros: catalogos y valores iniciales (idempotente)
-- ===================================================================
INSERT IGNORE INTO master_catalogs (code, name, description) VALUES
  ('ROLE', 'Roles', 'Roles del sistema'),
  ('USER_STATUS', 'Estados de usuario', 'Estados posibles de un usuario'),
  ('TENANT_STATUS', 'Estados de tenant', 'Estados posibles de un tenant'),
  ('PROGRAM_STATUS', 'Estados de programa', 'Estados de un programa de entrenamiento'),
  ('COMPONENT_STATUS', 'Estados de componente', 'Estados de un componente'),
  ('TOPIC_STATUS', 'Estados de tema', 'Estados de un tema de temario'),
  ('ATTENDANCE_STATUS', 'Estados de asistencia', 'Estados posibles de un registro de asistencia'),
  ('LEAVE_STATUS', 'Estados de solicitud de permiso', 'Estados de una solicitud de permiso'),
  ('LEAVE_TYPE', 'Tipos de permiso', 'Tipos de solicitud de permiso'),
  ('ALERT_TYPE', 'Tipos de alerta', 'Tipos de alerta automatica'),
  ('ALERT_PRIORITY', 'Prioridades de alerta', 'Prioridad de una alerta'),
  ('NOTIFICATION_TYPE', 'Tipos de notificacion', 'Canal de notificacion'),
  ('SESSION_TYPE', 'Tipos de sesion', 'Tipo de sesion de clase'),
  ('CLASS_MODALITY', 'Modalidades de clase', 'Modalidad de dictado de una clase'),
  ('HOLIDAY_TYPE', 'Tipos de feriado', 'Tipo de feriado'),
  ('ABSENCE_REASON', 'Motivos de inasistencia', 'Motivo registrado de una inasistencia'),
  ('AUDIT_TYPE', 'Tipos de auditoria', 'Tipo de accion auditada'),
  ('EVENT_TYPE', 'Tipos de evento', 'Tipo de evento de dominio'),
  ('ALERT_STATUS', 'Estados de alerta', 'Estado de lectura de una alerta'),
  ('DOCUMENT_TYPE', 'Tipos de documento', 'Tipo de documento de identidad'),
  ('PRE_ENROLLMENT_STATUS', 'Estados de preinscripcion', 'Estado de una preinscripcion publica');

INSERT IGNORE INTO master_catalog_values (catalog_id, code, label, sort_order) VALUES
  ((SELECT id FROM master_catalogs WHERE code = 'ROLE'), 'super_admin', 'Super administrador', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'ROLE'), 'tenant_admin', 'Administrador de tenant', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'ROLE'), 'instructor', 'Instructor', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'ROLE'), 'student', 'Talento', 4),

  ((SELECT id FROM master_catalogs WHERE code = 'USER_STATUS'), 'active', 'Activo', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'USER_STATUS'), 'inactive', 'Inactivo', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'USER_STATUS'), 'locked', 'Bloqueado', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'USER_STATUS'), 'pending', 'Pendiente de activacion', 4),

  ((SELECT id FROM master_catalogs WHERE code = 'TENANT_STATUS'), 'active', 'Activo', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'TENANT_STATUS'), 'inactive', 'Inactivo', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'TENANT_STATUS'), 'suspended', 'Suspendido', 3),

  ((SELECT id FROM master_catalogs WHERE code = 'PROGRAM_STATUS'), 'draft', 'Borrador', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'PROGRAM_STATUS'), 'active', 'Activo', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'PROGRAM_STATUS'), 'paused', 'En pausa', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'PROGRAM_STATUS'), 'finished', 'Finalizado', 4),
  ((SELECT id FROM master_catalogs WHERE code = 'PROGRAM_STATUS'), 'cancelled', 'Cancelado', 5),
  ((SELECT id FROM master_catalogs WHERE code = 'PROGRAM_STATUS'), 'archived', 'Archivado', 6),

  ((SELECT id FROM master_catalogs WHERE code = 'COMPONENT_STATUS'), 'pending', 'Pendiente', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'COMPONENT_STATUS'), 'active', 'Activo', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'COMPONENT_STATUS'), 'completed', 'Completado', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'COMPONENT_STATUS'), 'cancelled', 'Cancelado', 4),

  ((SELECT id FROM master_catalogs WHERE code = 'TOPIC_STATUS'), 'pending', 'Pendiente', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'TOPIC_STATUS'), 'scheduled', 'Programado', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'TOPIC_STATUS'), 'in_progress', 'En progreso', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'TOPIC_STATUS'), 'completed', 'Completado', 4),
  ((SELECT id FROM master_catalogs WHERE code = 'TOPIC_STATUS'), 'delayed', 'Atrasado', 5),
  ((SELECT id FROM master_catalogs WHERE code = 'TOPIC_STATUS'), 'rescheduled', 'Reprogramado', 6),
  ((SELECT id FROM master_catalogs WHERE code = 'TOPIC_STATUS'), 'cancelled', 'Cancelado', 7),

  ((SELECT id FROM master_catalogs WHERE code = 'ATTENDANCE_STATUS'), 'present', 'Presente', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'ATTENDANCE_STATUS'), 'absent', 'Ausente', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'ATTENDANCE_STATUS'), 'justified_absent', 'Ausente justificado', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'ATTENDANCE_STATUS'), 'late', 'Tarde', 4),
  ((SELECT id FROM master_catalogs WHERE code = 'ATTENDANCE_STATUS'), 'left_early', 'Retirado', 5),
  ((SELECT id FROM master_catalogs WHERE code = 'ATTENDANCE_STATUS'), 'approved_leave', 'Permiso aprobado', 6),

  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_STATUS'), 'pending', 'Pendiente', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_STATUS'), 'approved', 'Aprobado', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_STATUS'), 'rejected', 'Rechazado', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_STATUS'), 'cancelled', 'Cancelado', 4),
  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_STATUS'), 'expired', 'Vencido', 5),

  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_TYPE'), 'medical', 'Medico', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_TYPE'), 'personal', 'Personal', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_TYPE'), 'family', 'Familiar', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_TYPE'), 'academic', 'Academico', 4),
  ((SELECT id FROM master_catalogs WHERE code = 'LEAVE_TYPE'), 'other', 'Otro', 5),

  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'multiple_absences', 'Alumno con multiples inasistencias', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'no_classes_taken', 'Alumno sin clases realizadas', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'low_progress', 'Alumno con bajo avance', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'instructor_no_record', 'Instructor sin registrar clases', 4),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'instructor_incomplete_topics', 'Instructor con temas incompletos', 5),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'topic_delayed', 'Tema atrasado', 6),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'topic_ahead', 'Tema adelantado', 7),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'schedule_change', 'Cambio de horario', 8),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'class_cancelled', 'Clase cancelada', 9),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'leave_pending', 'Permiso pendiente', 10),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'holiday_affects_calendar', 'Feriado afecta el calendario', 11),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'program_without_instructor', 'Programa sin instructor', 12),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'component_without_students', 'Componente sin alumnos', 13),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'tenant_inactive', 'Tenant inactivo', 14),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'configuration_error', 'Error de configuracion', 15),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'absence_notice', 'Aviso de inasistencia del alumno', 16),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'instructor_absence_notice', 'Aviso de inasistencia del profesor', 17),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'password_reset_request', 'Solicitud de recuperación de clave', 18),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'support_ticket', 'Reporte de soporte', 19),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_TYPE'), 'material_ready', 'Material generado con IA', 20),

  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_PRIORITY'), 'low', 'Baja', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_PRIORITY'), 'medium', 'Media', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_PRIORITY'), 'high', 'Alta', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_PRIORITY'), 'critical', 'Critica', 4),

  ((SELECT id FROM master_catalogs WHERE code = 'NOTIFICATION_TYPE'), 'system', 'Sistema', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'NOTIFICATION_TYPE'), 'email', 'Correo electronico', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'NOTIFICATION_TYPE'), 'push', 'Push', 3),

  ((SELECT id FROM master_catalogs WHERE code = 'SESSION_TYPE'), 'theory', 'Teorica', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'SESSION_TYPE'), 'practice', 'Practica', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'SESSION_TYPE'), 'workshop', 'Taller', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'SESSION_TYPE'), 'evaluation', 'Evaluacion', 4),

  ((SELECT id FROM master_catalogs WHERE code = 'CLASS_MODALITY'), 'onsite', 'Presencial', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'CLASS_MODALITY'), 'virtual', 'Virtual', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'CLASS_MODALITY'), 'hybrid', 'Hibrida', 3),

  ((SELECT id FROM master_catalogs WHERE code = 'HOLIDAY_TYPE'), 'national', 'Nacional', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'HOLIDAY_TYPE'), 'tenant', 'Especifico de tenant', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'HOLIDAY_TYPE'), 'religious', 'Religioso', 3),

  ((SELECT id FROM master_catalogs WHERE code = 'ABSENCE_REASON'), 'health', 'Salud', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'ABSENCE_REASON'), 'personal', 'Personal', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'ABSENCE_REASON'), 'work', 'Laboral', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'ABSENCE_REASON'), 'technical', 'Problema tecnico', 4),
  ((SELECT id FROM master_catalogs WHERE code = 'ABSENCE_REASON'), 'other', 'Otro', 5),

  ((SELECT id FROM master_catalogs WHERE code = 'AUDIT_TYPE'), 'insert', 'Creacion', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'AUDIT_TYPE'), 'update', 'Modificacion', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'AUDIT_TYPE'), 'delete', 'Eliminacion logica', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'AUDIT_TYPE'), 'login_success', 'Acceso exitoso', 4),
  ((SELECT id FROM master_catalogs WHERE code = 'AUDIT_TYPE'), 'login_failed', 'Intento de acceso fallido', 5),

  ((SELECT id FROM master_catalogs WHERE code = 'EVENT_TYPE'), 'class_started', 'Clase iniciada', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'EVENT_TYPE'), 'class_completed', 'Clase completada', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'EVENT_TYPE'), 'topic_advanced', 'Tema adelantado', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'EVENT_TYPE'), 'topic_rescheduled', 'Tema reprogramado', 4),
  ((SELECT id FROM master_catalogs WHERE code = 'EVENT_TYPE'), 'leave_requested', 'Permiso solicitado', 5),
  ((SELECT id FROM master_catalogs WHERE code = 'EVENT_TYPE'), 'leave_resolved', 'Permiso resuelto', 6),
  ((SELECT id FROM master_catalogs WHERE code = 'EVENT_TYPE'), 'alert_raised', 'Alerta generada', 7),

  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_STATUS'), 'open', 'Abierta', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_STATUS'), 'read', 'Leida', 2),

  ((SELECT id FROM master_catalogs WHERE code = 'DOCUMENT_TYPE'), 'dni', 'DNI', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'DOCUMENT_TYPE'), 'ce', 'Carné de extranjería', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'DOCUMENT_TYPE'), 'passport', 'Pasaporte', 3),
  ((SELECT id FROM master_catalogs WHERE code = 'DOCUMENT_TYPE'), 'other', 'Otro', 4),

  ((SELECT id FROM master_catalogs WHERE code = 'PRE_ENROLLMENT_STATUS'), 'pending', 'Pendiente', 1),
  ((SELECT id FROM master_catalogs WHERE code = 'PRE_ENROLLMENT_STATUS'), 'confirmed', 'Confirmada', 2),
  ((SELECT id FROM master_catalogs WHERE code = 'PRE_ENROLLMENT_STATUS'), 'rejected', 'Rechazada', 3);

-- ===================================================================
-- Procedimientos almacenados
-- ===================================================================
DROP PROCEDURE IF EXISTS sp_migrate_component_groups_v1;
DROP PROCEDURE IF EXISTS sp_migrate_tenant_logo_v1;
DROP PROCEDURE IF EXISTS sp_migrate_program_public_v1;
DROP PROCEDURE IF EXISTS sp_migrate_tenant_contact_v1;
DROP PROCEDURE IF EXISTS sp_tenants_set_contact;
DROP PROCEDURE IF EXISTS sp_migrate_program_colors_v1;
DROP PROCEDURE IF EXISTS sp_migrate_leave_topic_v1;
DROP PROCEDURE IF EXISTS sp_migrate_student_profile_v1;
DROP PROCEDURE IF EXISTS sp_migrate_onboarding_v1;
DROP PROCEDURE IF EXISTS sp_migrate_class_links_v1;
DROP PROCEDURE IF EXISTS sp_migrate_program_type_v1;
DROP PROCEDURE IF EXISTS sp_migrate_schedule_close_v1;
DROP PROCEDURE IF EXISTS sp_programs_schedule_close;
DROP PROCEDURE IF EXISTS sp_topics_apply_plan;
DROP PROCEDURE IF EXISTS sp_program_windows_list;
DROP PROCEDURE IF EXISTS sp_auth_student_context;
DROP PROCEDURE IF EXISTS sp_admin_dashboard;
DROP PROCEDURE IF EXISTS sp_admin_dashboard_agenda;
DROP PROCEDURE IF EXISTS sp_self_enroll_catalog;
DROP PROCEDURE IF EXISTS sp_group_self_enroll;
DROP PROCEDURE IF EXISTS sp_group_self_unenroll;
DROP PROCEDURE IF EXISTS sp_program_windows_set;
DROP PROCEDURE IF EXISTS sp_programs_set_colors;
DROP PROCEDURE IF EXISTS sp_components_set_colors;
DROP PROCEDURE IF EXISTS sp_user_invitations_create;
DROP PROCEDURE IF EXISTS sp_user_invitations_get;
DROP PROCEDURE IF EXISTS sp_user_invitations_accept;
DROP PROCEDURE IF EXISTS sp_tenants_set_logo;
DROP PROCEDURE IF EXISTS sp_tenants_set_brand_color;
DROP PROCEDURE IF EXISTS sp_tenants_get_public_branding;
DROP PROCEDURE IF EXISTS sp_system_health;
DROP PROCEDURE IF EXISTS sp_authenticate_user;
DROP PROCEDURE IF EXISTS sp_auth_get_login_context;
DROP PROCEDURE IF EXISTS sp_auth_register_login_result;
DROP PROCEDURE IF EXISTS sp_auth_log_access;
DROP PROCEDURE IF EXISTS sp_master_catalog_values_list;
DROP PROCEDURE IF EXISTS sp_bootstrap_superadmin;
DROP PROCEDURE IF EXISTS sp_users_get_credentials;
DROP PROCEDURE IF EXISTS sp_auth_change_own_password;
DROP PROCEDURE IF EXISTS sp_auth_admin_reset_password;
DROP PROCEDURE IF EXISTS sp_tenants_list;
DROP PROCEDURE IF EXISTS sp_tenants_get;
DROP PROCEDURE IF EXISTS sp_tenants_create;
DROP PROCEDURE IF EXISTS sp_tenants_update;
DROP PROCEDURE IF EXISTS sp_tenants_set_status;
DROP PROCEDURE IF EXISTS sp_users_list;
DROP PROCEDURE IF EXISTS sp_users_create;
DROP PROCEDURE IF EXISTS sp_users_set_active;
DROP PROCEDURE IF EXISTS sp_programs_list;
DROP PROCEDURE IF EXISTS sp_programs_create;
DROP PROCEDURE IF EXISTS sp_programs_update;
DROP PROCEDURE IF EXISTS sp_programs_set_status;
DROP PROCEDURE IF EXISTS sp_programs_enroll_student;
DROP PROCEDURE IF EXISTS sp_components_list;
DROP PROCEDURE IF EXISTS sp_components_create;
DROP PROCEDURE IF EXISTS sp_components_update;
DROP PROCEDURE IF EXISTS sp_component_groups_list;
DROP PROCEDURE IF EXISTS sp_component_groups_list_by_program;
DROP PROCEDURE IF EXISTS sp_group_schedule_days_list_by_program;
DROP PROCEDURE IF EXISTS sp_component_groups_create;
DROP PROCEDURE IF EXISTS sp_component_groups_update;
DROP PROCEDURE IF EXISTS sp_group_enrollments_add;
DROP PROCEDURE IF EXISTS sp_topics_list;
DROP PROCEDURE IF EXISTS sp_topics_list_by_program;
DROP PROCEDURE IF EXISTS sp_topics_create;
DROP PROCEDURE IF EXISTS sp_topics_update_status;
DROP PROCEDURE IF EXISTS sp_topics_reschedule;
DROP PROCEDURE IF EXISTS sp_topics_generate_schedule;
DROP PROCEDURE IF EXISTS sp_group_schedule_days_list;
DROP PROCEDURE IF EXISTS sp_group_schedule_days_add;
DROP PROCEDURE IF EXISTS sp_group_schedule_days_remove;
DROP PROCEDURE IF EXISTS sp_holidays_list;
DROP PROCEDURE IF EXISTS sp_holidays_create;
DROP PROCEDURE IF EXISTS sp_alerts_run_detection;
DROP PROCEDURE IF EXISTS sp_alerts_list;
DROP PROCEDURE IF EXISTS sp_alerts_mark_read;
DROP PROCEDURE IF EXISTS sp_attendance_upsert;
DROP PROCEDURE IF EXISTS sp_attendance_list_by_topic;
DROP PROCEDURE IF EXISTS sp_attendance_list_by_student;
DROP PROCEDURE IF EXISTS sp_leave_requests_create;
DROP PROCEDURE IF EXISTS sp_leave_requests_list;
DROP PROCEDURE IF EXISTS sp_leave_requests_resolve;
DROP PROCEDURE IF EXISTS sp_leave_requests_cancel;
DROP PROCEDURE IF EXISTS sp_groups_list_by_instructor;
DROP PROCEDURE IF EXISTS sp_reports_attendance_by_program;
DROP PROCEDURE IF EXISTS sp_reports_attendance_by_component;
DROP PROCEDURE IF EXISTS sp_reports_attendance_by_student;
DROP PROCEDURE IF EXISTS sp_reports_absences;
DROP PROCEDURE IF EXISTS sp_reports_program_progress;
DROP PROCEDURE IF EXISTS sp_reports_component_progress;
DROP PROCEDURE IF EXISTS sp_reports_instructor_compliance;
DROP PROCEDURE IF EXISTS sp_reports_delayed_topics;
DROP PROCEDURE IF EXISTS sp_reports_ahead_topics;
DROP PROCEDURE IF EXISTS sp_reports_leave_requests_summary;
DROP PROCEDURE IF EXISTS sp_reports_period_comparison;
DROP PROCEDURE IF EXISTS sp_student_agenda;
DROP PROCEDURE IF EXISTS sp_student_metrics;
DROP PROCEDURE IF EXISTS sp_instructor_agenda;
DROP PROCEDURE IF EXISTS sp_topics_list_by_instructor;
DROP PROCEDURE IF EXISTS sp_instructor_metrics;
DROP PROCEDURE IF EXISTS sp_dashboard_get;
DROP PROCEDURE IF EXISTS sp_attendance_record;
DROP PROCEDURE IF EXISTS sp_component_materials_get;
DROP PROCEDURE IF EXISTS sp_component_materials_set;
DROP PROCEDURE IF EXISTS sp_component_materials_remove;
DROP PROCEDURE IF EXISTS sp_topic_material_get;
DROP PROCEDURE IF EXISTS sp_topics_list_by_student;
DROP PROCEDURE IF EXISTS sp_progress_board;
DROP PROCEDURE IF EXISTS sp_progress_group_attendance;
DROP PROCEDURE IF EXISTS sp_component_material_prompt_data;
DROP PROCEDURE IF EXISTS sp_program_temario_export;
DROP PROCEDURE IF EXISTS sp_topics_update_by_position;
DROP PROCEDURE IF EXISTS sp_public_program_get;
DROP PROCEDURE IF EXISTS sp_public_program_temario;
DROP PROCEDURE IF EXISTS sp_public_program_instructors;
DROP PROCEDURE IF EXISTS sp_public_program_schedule;
DROP PROCEDURE IF EXISTS sp_programs_update_public;
DROP PROCEDURE IF EXISTS sp_programs_set_banner;
DROP PROCEDURE IF EXISTS sp_users_update_public_profile;
DROP PROCEDURE IF EXISTS sp_users_set_photo;
DROP PROCEDURE IF EXISTS sp_profile_get_mine;
DROP PROCEDURE IF EXISTS sp_profile_update_mine;
DROP PROCEDURE IF EXISTS sp_profile_set_my_photo;
DROP PROCEDURE IF EXISTS sp_student_profiles_list;
DROP PROCEDURE IF EXISTS sp_reactions_set;
DROP PROCEDURE IF EXISTS sp_reactions_list_mine;
DROP PROCEDURE IF EXISTS sp_reactions_summary;
DROP PROCEDURE IF EXISTS sp_feedback_create;
DROP PROCEDURE IF EXISTS sp_feedback_list;
DROP PROCEDURE IF EXISTS sp_instructor_absences_create;
DROP PROCEDURE IF EXISTS sp_instructor_absences_resolve;
DROP PROCEDURE IF EXISTS sp_instructor_absences_cancel;
DROP PROCEDURE IF EXISTS sp_instructor_absences_list;
DROP PROCEDURE IF EXISTS sp_instructor_changes_list;
DROP PROCEDURE IF EXISTS sp_instructor_indicators;
DROP PROCEDURE IF EXISTS sp_instructor_absence_classes;
DROP PROCEDURE IF EXISTS sp_student_absence_events;
DROP PROCEDURE IF EXISTS sp_student_attendance_totals;
DROP PROCEDURE IF EXISTS sp_password_reset_request;
DROP PROCEDURE IF EXISTS sp_password_reset_requests_list;
DROP PROCEDURE IF EXISTS sp_password_reset_requests_resolve;
DROP PROCEDURE IF EXISTS sp_instructor_availability_list;
DROP PROCEDURE IF EXISTS sp_instructor_availability_set;
DROP PROCEDURE IF EXISTS sp_schedule_planning_groups;
DROP PROCEDURE IF EXISTS sp_schedule_busy_dates;
DROP PROCEDURE IF EXISTS sp_group_schedule_replace;
DROP PROCEDURE IF EXISTS sp_support_tickets_create;
DROP PROCEDURE IF EXISTS sp_support_tickets_list;
DROP PROCEDURE IF EXISTS sp_support_ticket_get;
DROP PROCEDURE IF EXISTS sp_support_ticket_messages;
DROP PROCEDURE IF EXISTS sp_support_ticket_reply;
DROP PROCEDURE IF EXISTS sp_support_ticket_set_status;
DROP PROCEDURE IF EXISTS sp_ai_reports_create;
DROP PROCEDURE IF EXISTS sp_ai_reports_list;
DROP PROCEDURE IF EXISTS sp_ai_reports_get;
DROP PROCEDURE IF EXISTS sp_onboarding_get;
DROP PROCEDURE IF EXISTS sp_onboarding_set;
DROP PROCEDURE IF EXISTS sp_class_access;
DROP PROCEDURE IF EXISTS sp_topic_class_info_set;
DROP PROCEDURE IF EXISTS sp_group_meeting_set;
DROP PROCEDURE IF EXISTS sp_topic_class_get;
DROP PROCEDURE IF EXISTS sp_topic_resources_list;
DROP PROCEDURE IF EXISTS sp_topic_resources_add;
DROP PROCEDURE IF EXISTS sp_topic_resources_remove;
DROP PROCEDURE IF EXISTS sp_topic_resource_get;
DROP PROCEDURE IF EXISTS sp_material_jobs_create;
DROP PROCEDURE IF EXISTS sp_material_jobs_progress;
DROP PROCEDURE IF EXISTS sp_material_jobs_finish;
DROP PROCEDURE IF EXISTS sp_material_jobs_list;
DROP PROCEDURE IF EXISTS sp_material_jobs_get;
DROP PROCEDURE IF EXISTS sp_material_jobs_interrupt;
DROP PROCEDURE IF EXISTS sp_programs_set_type;
DROP PROCEDURE IF EXISTS sp_induction_access;
DROP PROCEDURE IF EXISTS sp_induction_programs;
DROP PROCEDURE IF EXISTS sp_induction_steps_list;
DROP PROCEDURE IF EXISTS sp_induction_step_save;
DROP PROCEDURE IF EXISTS sp_induction_step_remove;
DROP PROCEDURE IF EXISTS sp_induction_step_get;
DROP PROCEDURE IF EXISTS sp_induction_progress_list;
DROP PROCEDURE IF EXISTS sp_induction_progress_set;
DROP PROCEDURE IF EXISTS sp_induction_students;
DROP PROCEDURE IF EXISTS sp_pre_enrollments_create;
DROP PROCEDURE IF EXISTS sp_pre_enrollments_list;
DROP PROCEDURE IF EXISTS sp_pre_enrollments_resolve;
-- Renombradas/eliminadas por el refactor a grupos (component_groups): estos
-- guards se quedan para limpiar cualquier entorno que todavia las tenga.
DROP PROCEDURE IF EXISTS sp_components_assign_instructor;
DROP PROCEDURE IF EXISTS sp_components_enroll_student;
DROP PROCEDURE IF EXISTS sp_components_list_by_instructor;
DROP PROCEDURE IF EXISTS sp_program_schedule_days_list;
DROP PROCEDURE IF EXISTS sp_program_schedule_days_add;
DROP PROCEDURE IF EXISTS sp_program_schedule_days_remove;

DELIMITER $$

-- Migracion unica: mueve instructor/horario de "por programa" y "por
-- componente" a "por grupo" (component_groups), preservando datos
-- existentes. Cada paso esta guardado por una comprobacion en
-- information_schema, asi que es seguro volver a llamarla: en una base
-- nueva no encuentra nada que migrar, y en una ya migrada tampoco. La
-- llama database/run-schema.js despues de aplicar todos los procedimientos.
CREATE PROCEDURE sp_migrate_component_groups_v1()
BEGIN
  DECLARE v_has_old_component_instructor INT DEFAULT 0;
  DECLARE v_has_old_topics_component INT DEFAULT 0;
  DECLARE v_has_old_component_enrollments INT DEFAULT 0;
  DECLARE v_has_old_program_schedule INT DEFAULT 0;

  SELECT COUNT(*) INTO v_has_old_component_instructor FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'components' AND column_name = 'instructor_id';
  SELECT COUNT(*) INTO v_has_old_topics_component FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'topics' AND column_name = 'component_id';
  SELECT COUNT(*) INTO v_has_old_component_enrollments FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'component_enrollments';
  SELECT COUNT(*) INTO v_has_old_program_schedule FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'program_schedule_days';

  -- 1) Un "Grupo A" por componente existente, heredando su instructor y estado.
  IF v_has_old_component_instructor > 0 THEN
    INSERT INTO component_groups (component_id, name, instructor_id, status_id, created_at)
    SELECT c.id, 'Grupo A', c.instructor_id, c.status_id, NOW() FROM components c
    WHERE c.is_deleted = FALSE AND NOT EXISTS (SELECT 1 FROM component_groups g WHERE g.component_id = c.id);
  END IF;

  -- 2) Copiar el horario del programa a cada grupo recien creado (punto de
  -- partida editable despues por drag-and-drop) y retirar la tabla vieja.
  IF v_has_old_program_schedule > 0 THEN
    INSERT INTO component_group_schedule_days (group_id, weekday, start_time, end_time, created_at)
    SELECT g.id, psd.weekday, psd.start_time, psd.end_time, NOW()
    FROM component_groups g
    JOIN components c ON c.id = g.component_id
    JOIN training_programs p ON p.id = c.program_id
    JOIN program_schedule_days psd ON psd.program_id = p.id AND psd.is_deleted = FALSE
    WHERE NOT EXISTS (SELECT 1 FROM component_group_schedule_days x WHERE x.group_id = g.id AND x.weekday = psd.weekday);

    DROP TABLE program_schedule_days;
  END IF;

  -- 3) topics: component_id -> group_id, se retira el instructor propio
  -- (ahora se resuelve via el grupo, para no duplicar el dato).
  IF v_has_old_topics_component > 0 THEN
    ALTER TABLE topics ADD COLUMN group_id BIGINT UNSIGNED NULL AFTER component_id;
    UPDATE topics t JOIN component_groups g ON g.component_id = t.component_id SET t.group_id = g.id WHERE t.group_id IS NULL;
    ALTER TABLE topics
      MODIFY group_id BIGINT UNSIGNED NOT NULL,
      ADD CONSTRAINT fk_topic_group FOREIGN KEY (group_id) REFERENCES component_groups(id),
      DROP FOREIGN KEY fk_topic_component,
      DROP COLUMN component_id;
    ALTER TABLE topics DROP FOREIGN KEY fk_topic_instructor, DROP COLUMN instructor_id;
  END IF;

  -- 4) component_enrollments -> group_enrollments (rename + reapuntar FK).
  -- En una base nueva (ninguna de las dos tablas existe todavia) se crea
  -- directamente en su forma final.
  IF v_has_old_component_enrollments > 0 THEN
    RENAME TABLE component_enrollments TO group_enrollments;
    ALTER TABLE group_enrollments ADD COLUMN group_id BIGINT UNSIGNED NULL AFTER component_id;
    UPDATE group_enrollments e JOIN component_groups g ON g.component_id = e.component_id SET e.group_id = g.id WHERE e.group_id IS NULL;
    ALTER TABLE group_enrollments
      MODIFY group_id BIGINT UNSIGNED NOT NULL,
      ADD CONSTRAINT fk_group_enrollment_group FOREIGN KEY (group_id) REFERENCES component_groups(id),
      DROP FOREIGN KEY fk_component_enrollment_component,
      DROP COLUMN component_id,
      DROP INDEX uq_component_student,
      ADD UNIQUE KEY uq_group_student (group_id, student_id);
  ELSE
    CREATE TABLE IF NOT EXISTS group_enrollments (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      group_id BIGINT UNSIGNED NOT NULL,
      student_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by BIGINT UNSIGNED NULL,
      deleted_at DATETIME NULL,
      deleted_by BIGINT UNSIGNED NULL,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE KEY uq_group_student (group_id, student_id),
      CONSTRAINT fk_group_enrollment_group FOREIGN KEY (group_id) REFERENCES component_groups(id),
      CONSTRAINT fk_group_enrollment_student FOREIGN KEY (student_id) REFERENCES users(id)
    );
  END IF;

  -- 5) components: el instructor ya vive en component_groups.
  IF v_has_old_component_instructor > 0 THEN
    ALTER TABLE components DROP FOREIGN KEY fk_component_instructor, DROP COLUMN instructor_id;
  END IF;
END$$

CREATE PROCEDURE sp_migrate_tenant_logo_v1()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'tenants' AND column_name = 'logo_path'
  ) THEN
    ALTER TABLE tenants ADD COLUMN logo_path VARCHAR(255) NULL AFTER timezone;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'tenants' AND column_name = 'brand_color'
  ) THEN
    ALTER TABLE tenants ADD COLUMN brand_color VARCHAR(7) NULL AFTER logo_path;
  END IF;
END$$

-- Web publica por programa (link propio, banner, publico objetivo) y
-- perfil publico de los instructores que se muestra en ella. Idempotente.
-- Paleta de colores (principal + acento) por programa y, opcionalmente,
-- por componente. NULL = hereda (componente -> programa -> marca del
-- tenant). Idempotente.
CREATE PROCEDURE sp_migrate_program_colors_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'training_programs' AND column_name = 'color_primary') THEN
    ALTER TABLE training_programs
      ADD COLUMN color_primary VARCHAR(7) NULL AFTER banner_path,
      ADD COLUMN color_accent VARCHAR(7) NULL AFTER color_primary;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'components' AND column_name = 'color_primary') THEN
    ALTER TABLE components
      ADD COLUMN color_primary VARCHAR(7) NULL AFTER sort_order,
      ADD COLUMN color_accent VARCHAR(7) NULL AFTER color_primary;
  END IF;
END$$

-- Una solicitud de inasistencia puede apuntar a una clase concreta
-- (topic_id); sin clase sigue siendo un permiso por rango de fechas.
-- Idempotente.
CREATE PROCEDURE sp_migrate_leave_topic_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'leave_requests' AND column_name = 'topic_id') THEN
    ALTER TABLE leave_requests
      ADD COLUMN topic_id BIGINT UNSIGNED NULL AFTER student_id,
      ADD CONSTRAINT fk_leave_topic FOREIGN KEY (topic_id) REFERENCES topics(id);
  END IF;
END$$

-- Perfil del alumno: links (GitHub, portafolio) y datos de contacto. El
-- telefono es privado: solo lo ve el admin del tenant (lo filtra el SP).
-- linkedin_url, photo_path, public_headline y public_bio ya existen.
CREATE PROCEDURE sp_migrate_student_profile_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'github_url') THEN
    ALTER TABLE users
      ADD COLUMN github_url VARCHAR(255) NULL AFTER linkedin_url,
      ADD COLUMN portfolio_url VARCHAR(255) NULL AFTER github_url,
      ADD COLUMN contact_email VARCHAR(190) NULL AFTER portfolio_url,
      ADD COLUMN phone VARCHAR(40) NULL AFTER contact_email,
      ADD COLUMN city VARCHAR(120) NULL AFTER phone;
  END IF;
END$$

-- Guia de primer uso: cuando el usuario la termina (o la salta) no vuelve
-- a mostrarse, en ningun dispositivo.
CREATE PROCEDURE sp_migrate_onboarding_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'onboarding_done_at') THEN
    ALTER TABLE users ADD COLUMN onboarding_done_at DATETIME NULL AFTER must_change_password;
  END IF;
END$$

-- Clase en linea: link de la reunion (Teams/Meet/Zoom) por clase o por
-- grupo (vale para todas sus clases sin link propio), link de la grabacion
-- y una nota del profesor para los alumnos.
CREATE PROCEDURE sp_migrate_class_links_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'topics' AND column_name = 'meeting_url') THEN
    ALTER TABLE topics
      ADD COLUMN meeting_url VARCHAR(500) NULL AFTER duration_minutes,
      ADD COLUMN recording_url VARCHAR(500) NULL AFTER meeting_url,
      ADD COLUMN class_notes VARCHAR(2000) NULL AFTER recording_url;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'component_groups' AND column_name = 'meeting_url') THEN
    ALTER TABLE component_groups ADD COLUMN meeting_url VARCHAR(500) NULL AFTER instructor_id;
  END IF;
END$$

-- Tipo de programa: 'training' (clases con horario) o 'induction' (pasos a
-- ritmo propio). sequential: en induccion, las etapas se abren en orden.
CREATE PROCEDURE sp_migrate_program_type_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'training_programs' AND column_name = 'program_type') THEN
    ALTER TABLE training_programs
      ADD COLUMN program_type VARCHAR(20) NOT NULL DEFAULT 'training' AFTER cohort,
      ADD COLUMN sequential BOOLEAN NOT NULL DEFAULT TRUE AFTER program_type;
  END IF;
END$$

-- Horario cerrado por programa y disponibilidad de profesores por programa.
-- La disponibilidad general que existia se copia a cada programa en el que
-- el profesor dicta algun grupo.
CREATE PROCEDURE sp_migrate_schedule_close_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'training_programs' AND column_name = 'schedule_closed_at') THEN
    ALTER TABLE training_programs
      ADD COLUMN schedule_closed_at DATETIME NULL,
      ADD COLUMN schedule_closed_by BIGINT UNSIGNED NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'instructor_availability' AND column_name = 'program_id') THEN
    ALTER TABLE instructor_availability
      ADD COLUMN program_id BIGINT UNSIGNED NULL AFTER instructor_id,
      ADD INDEX idx_avail_program (program_id, instructor_id);
  END IF;
  INSERT INTO instructor_availability (instructor_id, program_id, weekday, start_time, end_time, created_at, created_by)
  SELECT a.instructor_id, x.program_id, a.weekday, a.start_time, a.end_time, a.created_at, a.created_by
  FROM instructor_availability a
  JOIN (SELECT DISTINCT g.instructor_id, c.program_id FROM component_groups g JOIN components c ON c.id = g.component_id
        WHERE g.is_deleted = FALSE AND c.is_deleted = FALSE AND g.instructor_id IS NOT NULL) x ON x.instructor_id = a.instructor_id
  WHERE a.program_id IS NULL;
  DELETE FROM instructor_availability WHERE program_id IS NULL;
END$$

-- El contacto del tenant pasa a ser un usuario (contact_user_id).
-- Idempotente; los tenants existentes quedan con su contacto de texto.
CREATE PROCEDURE sp_migrate_tenant_contact_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'tenants' AND column_name = 'contact_user_id') THEN
    ALTER TABLE tenants
      ADD COLUMN contact_user_id BIGINT UNSIGNED NULL AFTER slug,
      ADD CONSTRAINT fk_tenant_contact_user FOREIGN KEY (contact_user_id) REFERENCES users(id);
  END IF;
END$$

CREATE PROCEDURE sp_migrate_program_public_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'training_programs' AND column_name = 'public_slug') THEN
    ALTER TABLE training_programs
      ADD COLUMN public_slug VARCHAR(100) NULL AFTER ends_on,
      ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE AFTER public_slug,
      ADD COLUMN enrollment_open BOOLEAN NOT NULL DEFAULT TRUE AFTER is_public,
      ADD COLUMN public_tagline VARCHAR(255) NULL AFTER enrollment_open,
      ADD COLUMN public_audience TEXT NULL AFTER public_tagline,
      ADD COLUMN banner_path VARCHAR(255) NULL AFTER public_audience,
      ADD UNIQUE KEY uq_program_public_slug (tenant_id, public_slug);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'public_headline') THEN
    ALTER TABLE users
      ADD COLUMN public_headline VARCHAR(160) NULL AFTER must_change_password,
      ADD COLUMN public_bio TEXT NULL AFTER public_headline,
      ADD COLUMN photo_path VARCHAR(255) NULL AFTER public_bio,
      ADD COLUMN linkedin_url VARCHAR(255) NULL AFTER photo_path;
  END IF;
END$$

CREATE PROCEDURE sp_system_health()
BEGIN
  SELECT 'ok' AS status, DATABASE() AS database_name;
END$$

-- Reglas de negocio de login (usuario activo, tenant activo, bloqueo por intentos)
-- resueltas en SQL. La API solo compara el hash de contrasena (operacion tecnica)
-- y traduce el resultado a una respuesta HTTP.
-- El rol no se pide en el login: cada email tiene un unico rol (UNIQUE en
-- users.email), asi que se determina aqui a partir de la cuenta, nunca de
-- lo que el cliente diga que es. La UI de login no debe mostrar ni pedir rol.
CREATE PROCEDURE sp_auth_get_login_context(IN p_email VARCHAR(190))
BEGIN
  SELECT
    u.id AS user_id,
    u.tenant_id,
    u.full_name,
    u.email,
    u.password_hash,
    v.code AS role_code,
    u.is_active AS user_is_active,
    u.is_deleted AS user_is_deleted,
    u.must_change_password,
    u.failed_login_attempts,
    u.locked_until,
    (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS is_locked,
    t.id AS tenant_row_id,
    t.slug AS tenant_slug,
    t.logo_path AS tenant_logo_path,
    t.brand_color AS tenant_brand_color,
    (t.id IS NULL OR ts.code = 'active') AS tenant_is_active,
    t.is_deleted AS tenant_is_deleted
  FROM users u
  JOIN master_catalog_values v ON v.id = u.role_id AND v.is_deleted = FALSE
  LEFT JOIN tenants t ON t.id = u.tenant_id
  LEFT JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE u.email = p_email AND u.is_deleted = FALSE
  LIMIT 1;
END$$

-- Aplica la politica de bloqueo por intentos fallidos (5 intentos -> 15 minutos)
-- y resetea el contador en un acceso exitoso.
CREATE PROCEDURE sp_auth_register_login_result(IN p_user_id BIGINT UNSIGNED, IN p_success BOOLEAN)
BEGIN
  IF p_success THEN
    UPDATE users
    SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
    WHERE id = p_user_id;
  ELSE
    UPDATE users
    SET failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE) ELSE locked_until END,
        updated_at = NOW()
    WHERE id = p_user_id;
  END IF;
END$$

CREATE PROCEDURE sp_auth_log_access(
  IN p_user_id BIGINT UNSIGNED,
  IN p_tenant_id BIGINT UNSIGNED,
  IN p_email VARCHAR(190),
  IN p_role_code VARCHAR(80),
  IN p_success BOOLEAN,
  IN p_failure_reason VARCHAR(120),
  IN p_ip VARCHAR(64),
  IN p_user_agent VARCHAR(255)
)
BEGIN
  INSERT INTO login_audit (user_id, tenant_id, email_attempted, role_attempted, success, failure_reason, ip_address, user_agent)
  VALUES (p_user_id, p_tenant_id, p_email, p_role_code, p_success, p_failure_reason, p_ip, p_user_agent);
END$$

-- Alimenta selects/dropdowns del frontend sin usar enums rigidos.
CREATE PROCEDURE sp_master_catalog_values_list(IN p_catalog_code VARCHAR(80))
BEGIN
  SELECT v.id, v.code, v.label, v.sort_order, v.metadata
  FROM master_catalog_values v
  JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = p_catalog_code AND v.is_active = TRUE AND v.is_deleted = FALSE
  ORDER BY v.sort_order, v.label;
END$$

-- Crea el superadmin inicial solo si no existe uno todavia (idempotente).
CREATE PROCEDURE sp_bootstrap_superadmin(IN p_email VARCHAR(190), IN p_full_name VARCHAR(160), IN p_password_hash VARCHAR(255))
BEGIN
  DECLARE v_role_id BIGINT UNSIGNED;
  DECLARE v_existing INT;

  SELECT COUNT(*) INTO v_existing
  FROM users u
  JOIN master_catalog_values v ON v.id = u.role_id
  WHERE v.code = 'super_admin' AND u.is_deleted = FALSE;

  IF v_existing = 0 THEN
    SELECT v.id INTO v_role_id
    FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
    WHERE c.code = 'ROLE' AND v.code = 'super_admin';

    INSERT INTO users (tenant_id, full_name, email, password_hash, role_id, is_active)
    VALUES (NULL, p_full_name, p_email, p_password_hash, v_role_id, TRUE);

    SELECT 'created' AS result, LAST_INSERT_ID() AS user_id;
  ELSE
    SELECT 'already_exists' AS result, NULL AS user_id;
  END IF;
END$$

-- ===================================================================
-- Contrasenas: no hay servicio de correo, asi que no existe un flujo de
-- "forgot password" por email. En su lugar: el propio usuario puede
-- cambiar su contrasena conociendo la actual, y un admin (super_admin o
-- tenant_admin de su propio tenant) puede forzar un reseteo cuando el
-- usuario perdio el acceso. Ambos casos quedan auditados en users.updated_by.
-- ===================================================================
CREATE PROCEDURE sp_users_get_credentials(IN p_user_id BIGINT UNSIGNED)
BEGIN
  SELECT u.id AS user_id, u.tenant_id, u.password_hash, u.is_active, u.is_deleted, v.code AS role_code
  FROM users u
  JOIN master_catalog_values v ON v.id = u.role_id
  WHERE u.id = p_user_id AND u.is_deleted = FALSE
  LIMIT 1;
END$$

CREATE PROCEDURE sp_auth_change_own_password(IN p_user_id BIGINT UNSIGNED, IN p_new_password_hash VARCHAR(255))
BEGIN
  UPDATE users
  SET password_hash = p_new_password_hash, must_change_password = FALSE,
      failed_login_attempts = 0, locked_until = NULL,
      updated_at = NOW(), updated_by = p_user_id
  WHERE id = p_user_id AND is_deleted = FALSE;
END$$

-- Reseteo forzado por un administrador. La autorizacion (quien puede resetear
-- la contrasena de quien) es una regla de negocio y se valida aqui, no en la API.
CREATE PROCEDURE sp_auth_admin_reset_password(
  IN p_actor_user_id BIGINT UNSIGNED,
  IN p_actor_role VARCHAR(80),
  IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_target_user_id BIGINT UNSIGNED,
  IN p_new_password_hash VARCHAR(255)
)
BEGIN
  DECLARE v_target_tenant_id BIGINT UNSIGNED;
  DECLARE v_target_role VARCHAR(80);

  SELECT u.tenant_id, v.code INTO v_target_tenant_id, v_target_role
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id
  WHERE u.id = p_target_user_id AND u.is_deleted = FALSE;

  IF v_target_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  ELSEIF p_actor_role = 'super_admin' THEN
    -- autorizado para cualquier usuario
    UPDATE users
    SET password_hash = p_new_password_hash, must_change_password = TRUE,
        failed_login_attempts = 0, locked_until = NULL,
        updated_at = NOW(), updated_by = p_actor_user_id
    WHERE id = p_target_user_id;
  ELSEIF p_actor_role = 'tenant_admin' AND v_target_role IN ('instructor', 'student')
      AND v_target_tenant_id IS NOT NULL AND v_target_tenant_id = p_actor_tenant_id THEN
    UPDATE users
    SET password_hash = p_new_password_hash, must_change_password = TRUE,
        failed_login_attempts = 0, locked_until = NULL,
        updated_at = NOW(), updated_by = p_actor_user_id
    WHERE id = p_target_user_id;
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
END$$

-- ===================================================================
-- Tenants: solo el super_admin administra la plataforma completa.
-- ===================================================================
CREATE PROCEDURE sp_tenants_list(IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'super_admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT t.id, t.name, t.slug, t.contact_user_id,
         COALESCE(cu.full_name, t.contact_name) AS contact_name, COALESCE(cu.email, t.contact_email) AS contact_email,
         t.timezone, t.logo_path, t.brand_color,
         ts.code AS status_code, ts.label AS status_label, t.created_at,
         (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.is_deleted = FALSE) AS user_count
  FROM tenants t
  JOIN master_catalog_values ts ON ts.id = t.status_id
  LEFT JOIN users cu ON cu.id = t.contact_user_id
  WHERE t.is_deleted = FALSE
  ORDER BY t.name;
END$$

-- Cualquier rol puede leer su PROPIO tenant (para pintar el logo de la
-- barra lateral, etc.); super_admin puede leer cualquiera.
CREATE PROCEDURE sp_tenants_get(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role <> 'super_admin' AND p_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT t.id, t.name, t.slug, t.contact_name, t.contact_email, t.timezone, t.logo_path, t.brand_color,
         ts.code AS status_code, ts.label AS status_label
  FROM tenants t
  JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE t.id = p_tenant_id AND t.is_deleted = FALSE;
END$$

-- El contacto de un tenant es un USUARIO de la plataforma (se elige
-- buscandolo), no texto libre. contact_name/contact_email se guardan como
-- copia para los tenants antiguos; los listados leen los datos vigentes
-- del usuario.
CREATE PROCEDURE sp_tenants_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80),
  IN p_name VARCHAR(160), IN p_slug VARCHAR(80),
  IN p_contact_user_id BIGINT UNSIGNED, IN p_timezone VARCHAR(60)
)
BEGIN
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_contact_name VARCHAR(160);
  DECLARE v_contact_email VARCHAR(190);

  IF p_actor_role <> 'super_admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF EXISTS (SELECT 1 FROM tenants WHERE slug = p_slug AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'slug_already_exists';
  END IF;

  SELECT full_name, email INTO v_contact_name, v_contact_email
  FROM users WHERE id = p_contact_user_id AND is_deleted = FALSE AND is_active = TRUE;
  IF v_contact_email IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'contact_user_invalid';
  END IF;

  SELECT v.id INTO v_status_id
  FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'TENANT_STATUS' AND v.code = 'active';

  INSERT INTO tenants (name, slug, contact_user_id, contact_name, contact_email, timezone, status_id, created_by)
  VALUES (p_name, p_slug, p_contact_user_id, v_contact_name, v_contact_email,
          COALESCE(NULLIF(p_timezone, ''), 'America/Lima'), v_status_id, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS tenant_id;
END$$

CREATE PROCEDURE sp_tenants_set_contact(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80),
  IN p_tenant_id BIGINT UNSIGNED, IN p_contact_user_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_contact_name VARCHAR(160);
  DECLARE v_contact_email VARCHAR(190);

  IF p_actor_role <> 'super_admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_not_found';
  END IF;

  SELECT full_name, email INTO v_contact_name, v_contact_email
  FROM users WHERE id = p_contact_user_id AND is_deleted = FALSE AND is_active = TRUE;
  IF v_contact_email IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'contact_user_invalid';
  END IF;

  UPDATE tenants
  SET contact_user_id = p_contact_user_id, contact_name = v_contact_name, contact_email = v_contact_email,
      updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_tenant_id;
END$$

CREATE PROCEDURE sp_tenants_update(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_tenant_id BIGINT UNSIGNED,
  IN p_name VARCHAR(160), IN p_contact_name VARCHAR(160), IN p_contact_email VARCHAR(190), IN p_timezone VARCHAR(60)
)
BEGIN
  IF p_actor_role <> 'super_admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_not_found';
  END IF;

  UPDATE tenants
  SET name = p_name, contact_name = p_contact_name, contact_email = p_contact_email,
      timezone = COALESCE(NULLIF(p_timezone, ''), timezone),
      updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_tenant_id;
END$$

CREATE PROCEDURE sp_tenants_set_status(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80),
  IN p_tenant_id BIGINT UNSIGNED, IN p_status_code VARCHAR(80)
)
BEGIN
  DECLARE v_status_id BIGINT UNSIGNED;

  IF p_actor_role <> 'super_admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT v.id INTO v_status_id
  FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'TENANT_STATUS' AND v.code = p_status_code AND v.is_active = TRUE;

  IF v_status_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_not_found';
  END IF;

  UPDATE tenants SET status_id = v_status_id, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_tenant_id;
END$$

-- super_admin puede fijar el logo de cualquier tenant; tenant_admin solo el
-- del suyo. p_logo_path es NULL para volver al logo por defecto.
CREATE PROCEDURE sp_tenants_set_logo(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_tenant_id BIGINT UNSIGNED, IN p_logo_path VARCHAR(255)
)
BEGIN
  IF p_actor_role = 'tenant_admin' AND p_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_not_found';
  END IF;

  UPDATE tenants SET logo_path = p_logo_path, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_tenant_id;
END$$

CREATE PROCEDURE sp_tenants_set_brand_color(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_tenant_id BIGINT UNSIGNED, IN p_brand_color VARCHAR(7)
)
BEGIN
  IF p_actor_role = 'tenant_admin' AND p_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_not_found';
  END IF;

  IF p_brand_color IS NOT NULL AND p_brand_color NOT REGEXP '^#[0-9A-Fa-f]{6}$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_color_format';
  END IF;

  UPDATE tenants SET brand_color = p_brand_color, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_tenant_id;
END$$

-- Sin autenticar: alimenta la pagina de login propia del tenant
-- (/t/:slug) con su logo y color, sin exponer datos de contacto.
CREATE PROCEDURE sp_tenants_get_public_branding(IN p_slug VARCHAR(80))
BEGIN
  SELECT t.name, t.slug, t.logo_path, t.brand_color
  FROM tenants t
  JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE t.slug = p_slug AND t.is_deleted = FALSE AND ts.code = 'active';
END$$

-- ===================================================================
-- Usuarios: super_admin crea administradores de tenant (o superadmins);
-- tenant_admin crea instructores y talentos dentro de su propio tenant.
-- ===================================================================
CREATE PROCEDURE sp_users_list(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED,
  IN p_role_code_filter VARCHAR(80)
)
BEGIN
  DECLARE v_scope_tenant_id BIGINT UNSIGNED;

  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF p_actor_role = 'tenant_admin' THEN
    SET v_scope_tenant_id = p_actor_tenant_id;
  ELSE
    SET v_scope_tenant_id = p_tenant_id_filter;
  END IF;

  SELECT u.id, u.tenant_id, tn.name AS tenant_name, u.full_name, u.email, v.code AS role_code, u.is_active, u.must_change_password, u.created_at,
         u.public_headline, u.public_bio, u.photo_path, u.linkedin_url,
         CASE
           WHEN u.password_hash <> '' THEN NULL
           WHEN EXISTS (SELECT 1 FROM user_invitations i WHERE i.user_id = u.id AND i.used_at IS NULL
                        AND i.revoked_at IS NULL AND i.expires_at > NOW()) THEN 'pending'
           ELSE 'expired'
         END AS invitation_status,
         (SELECT MAX(i.expires_at) FROM user_invitations i WHERE i.user_id = u.id AND i.used_at IS NULL AND i.revoked_at IS NULL) AS invitation_expires_at
  FROM users u
  JOIN master_catalog_values v ON v.id = u.role_id
  LEFT JOIN tenants tn ON tn.id = u.tenant_id
  WHERE u.is_deleted = FALSE
    AND (v_scope_tenant_id IS NULL OR u.tenant_id = v_scope_tenant_id)
    AND (p_role_code_filter IS NULL OR v.code = p_role_code_filter)
  ORDER BY u.full_name;
END$$

-- ===================================================================
-- Programas, componentes, temario, feriados e inscripciones.
-- Alta y edicion: solo super_admin o tenant_admin (de su propio tenant).
-- Lectura: cualquier actor autenticado, siempre acotada a su tenant.
-- ===================================================================
CREATE PROCEDURE sp_programs_list(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_scope_tenant_id BIGINT UNSIGNED;
  SET v_scope_tenant_id = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT p.id, p.tenant_id, p.name, p.description, p.cohort, p.starts_on, p.ends_on,
         ps.code AS status_code, ps.label AS status_label,
         pm.code AS modality_code, pm.label AS modality_label, p.created_at,
         p.public_slug, p.is_public, p.enrollment_open, p.public_tagline, p.public_audience, p.banner_path,
         p.color_primary, p.color_accent, p.program_type, p.sequential,
         tn.slug AS tenant_slug, tn.name AS tenant_name, tn.logo_path AS tenant_logo_path, tn.brand_color AS tenant_brand_color,
         (SELECT COUNT(*) FROM pre_enrollments pe JOIN master_catalog_values pes ON pes.id = pe.status_id
          WHERE pe.program_id = p.id AND pe.is_deleted = FALSE AND pes.code = 'pending') AS pending_pre_enrollments
  FROM training_programs p
  JOIN tenants tn ON tn.id = p.tenant_id
  JOIN master_catalog_values ps ON ps.id = p.status_id
  LEFT JOIN master_catalog_values pm ON pm.id = p.modality_id
  WHERE p.is_deleted = FALSE
    AND (v_scope_tenant_id IS NULL OR p.tenant_id = v_scope_tenant_id)
  ORDER BY p.starts_on DESC, p.name;
END$$

CREATE PROCEDURE sp_programs_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_tenant_id BIGINT UNSIGNED, IN p_name VARCHAR(180), IN p_description TEXT, IN p_cohort VARCHAR(80),
  IN p_modality_code VARCHAR(80), IN p_starts_on DATE, IN p_ends_on DATE
)
BEGIN
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_modality_id BIGINT UNSIGNED;

  IF p_actor_role = 'tenant_admin' THEN
    IF p_tenant_id IS NULL OR p_tenant_id <> p_actor_tenant_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
    END IF;
  ELSEIF p_actor_role <> 'super_admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_not_found';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'PROGRAM_STATUS' AND v.code = 'draft';

  IF p_modality_code IS NOT NULL THEN
    SELECT v.id INTO v_modality_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
    WHERE c.code = 'CLASS_MODALITY' AND v.code = p_modality_code;
  END IF;

  INSERT INTO training_programs (tenant_id, name, description, cohort, status_id, modality_id, starts_on, ends_on, created_by)
  VALUES (p_tenant_id, p_name, p_description, p_cohort, v_status_id, v_modality_id, p_starts_on, p_ends_on, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS program_id;
END$$

CREATE PROCEDURE sp_programs_update(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_name VARCHAR(180), IN p_description TEXT, IN p_cohort VARCHAR(80),
  IN p_modality_code VARCHAR(80), IN p_starts_on DATE, IN p_ends_on DATE
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_modality_id BIGINT UNSIGNED;

  SELECT tenant_id INTO v_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;

  IF p_actor_role = 'tenant_admin' AND v_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF p_modality_code IS NOT NULL THEN
    SELECT v.id INTO v_modality_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
    WHERE c.code = 'CLASS_MODALITY' AND v.code = p_modality_code;
  END IF;
  IF p_starts_on IS NOT NULL AND p_ends_on IS NOT NULL AND p_starts_on > p_ends_on THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_date_range';
  END IF;

  UPDATE training_programs
  SET name = p_name, description = p_description, cohort = p_cohort, modality_id = v_modality_id,
      starts_on = p_starts_on, ends_on = p_ends_on, updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_program_id;
END$$

CREATE PROCEDURE sp_programs_set_status(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_status_code VARCHAR(80)
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;

  SELECT tenant_id INTO v_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;

  IF p_actor_role = 'tenant_admin' AND v_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'PROGRAM_STATUS' AND v.code = p_status_code AND v.is_active = TRUE;
  IF v_status_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;

  UPDATE training_programs SET status_id = v_status_id, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_program_id;
END$$

CREATE PROCEDURE sp_programs_enroll_student(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_student_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_student_tenant_id BIGINT UNSIGNED;
  DECLARE v_student_role VARCHAR(80);

  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;

  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT u.tenant_id, v.code INTO v_student_tenant_id, v_student_role
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id
  WHERE u.id = p_student_id AND u.is_deleted = FALSE;

  IF v_student_role IS NULL OR v_student_role NOT IN ('student', 'instructor', 'tenant_admin', 'super_admin')
     OR (v_student_role <> 'super_admin' AND NOT (v_student_tenant_id <=> v_program_tenant_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'student_invalid';
  END IF;

  IF EXISTS (SELECT 1 FROM program_enrollments WHERE program_id = p_program_id AND student_id = p_student_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'already_enrolled';
  END IF;

  INSERT INTO program_enrollments (program_id, student_id, created_by) VALUES (p_program_id, p_student_id, p_actor_user_id);
END$$

CREATE PROCEDURE sp_components_list(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_program_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  -- topic_count: temas del temario (el del grupo con mas temas; todos los
  -- grupos comparten malla). material_topic_count: cuantos de esos temas
  -- tienen su tema-NN en el material vigente (tope = topic_count).
  SELECT c.id, c.program_id, c.name, c.description, c.sort_order, c.color_primary, c.color_accent,
         cs.code AS status_code, cs.label AS status_label,
         (SELECT COUNT(*) FROM component_groups g WHERE g.component_id = c.id AND g.is_deleted = FALSE) AS group_count,
         COALESCE(tc.topic_count, 0) AS topic_count,
         LEAST(COALESCE(m.topic_file_count, 0), COALESCE(tc.topic_count, 0)) AS material_topic_count,
         m.id IS NOT NULL AS has_material
  FROM components c
  JOIN master_catalog_values cs ON cs.id = c.status_id
  LEFT JOIN (
    SELECT per_group.component_id, MAX(per_group.n) AS topic_count
    FROM (
      SELECT g.component_id, COUNT(t.id) AS n
      FROM component_groups g
      LEFT JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
      WHERE g.is_deleted = FALSE
      GROUP BY g.id, g.component_id
    ) AS per_group
    GROUP BY per_group.component_id
  ) AS tc ON tc.component_id = c.id
  LEFT JOIN component_materials m ON m.component_id = c.id AND m.is_deleted = FALSE
  WHERE c.program_id = p_program_id AND c.is_deleted = FALSE
  ORDER BY c.sort_order, c.name;
END$$

CREATE PROCEDURE sp_components_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_name VARCHAR(180), IN p_description TEXT, IN p_sort_order INT
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;

  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;

  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'COMPONENT_STATUS' AND v.code = 'pending';

  INSERT INTO components (program_id, name, description, sort_order, status_id, created_by)
  VALUES (p_program_id, p_name, p_description, COALESCE(p_sort_order, 0), v_status_id, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS component_id;
END$$

CREATE PROCEDURE sp_components_update(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED, IN p_name VARCHAR(180), IN p_description TEXT, IN p_sort_order INT
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;

  SELECT p.tenant_id INTO v_program_tenant_id
  FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'component_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  UPDATE components
  SET name = p_name, description = p_description, sort_order = COALESCE(p_sort_order, sort_order),
      updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_component_id;
END$$

-- ===================================================================
-- Grupos: un componente puede dictarse en paralelo a traves de varios
-- grupos (misma malla, instructor y horario propios). El instructor y el
-- horario recurrente viven aqui, no en components.
-- ===================================================================
CREATE PROCEDURE sp_component_groups_list(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_component_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT p.tenant_id INTO v_program_tenant_id
  FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'component_not_found';
  END IF;
  IF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  SELECT g.id, g.component_id, g.name, g.instructor_id, iu.full_name AS instructor_name,
         gs.code AS status_code, gs.label AS status_label,
         (SELECT COUNT(*) FROM group_enrollments ge WHERE ge.group_id = g.id AND ge.is_deleted = FALSE AND EXISTS (SELECT 1 FROM users ux WHERE ux.id = ge.student_id AND ux.is_active = TRUE AND ux.is_deleted = FALSE)) AS enrolled_students
  FROM component_groups g
  JOIN master_catalog_values gs ON gs.id = g.status_id
  LEFT JOIN users iu ON iu.id = g.instructor_id
  WHERE g.component_id = p_component_id AND g.is_deleted = FALSE
  ORDER BY g.name;
END$$

-- Todos los grupos de TODOS los componentes de un programa en una sola
-- llamada: alimenta el horario semanal unificado (un solo grid para armar
-- toda la malla del programa, en vez de entrar grupo por grupo).
CREATE PROCEDURE sp_component_groups_list_by_program(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_program_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  SELECT g.id AS group_id, g.name AS group_name, c.id AS component_id, c.name AS component_name,
         g.instructor_id, iu.full_name AS instructor_name,
         (SELECT COUNT(*) FROM group_enrollments ge WHERE ge.group_id = g.id AND ge.is_deleted = FALSE AND EXISTS (SELECT 1 FROM users ux WHERE ux.id = ge.student_id AND ux.is_active = TRUE AND ux.is_deleted = FALSE)) AS enrolled_students
  FROM component_groups g
  JOIN components c ON c.id = g.component_id
  LEFT JOIN users iu ON iu.id = g.instructor_id
  WHERE c.program_id = p_program_id AND g.is_deleted = FALSE AND c.is_deleted = FALSE
  ORDER BY c.sort_order, c.name, g.name;
END$$

-- Los horarios de TODOS los grupos de un programa en una sola llamada
-- (contraparte de arriba), para pintar el grid unificado sin N+1 requests.
CREATE PROCEDURE sp_group_schedule_days_list_by_program(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_program_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  SELECT d.id, d.group_id, d.weekday, d.start_time, d.end_time
  FROM component_group_schedule_days d
  JOIN component_groups g ON g.id = d.group_id
  JOIN components c ON c.id = g.component_id
  WHERE c.program_id = p_program_id AND d.is_deleted = FALSE AND g.is_deleted = FALSE AND c.is_deleted = FALSE
  ORDER BY d.weekday, d.start_time;
END$$

CREATE PROCEDURE sp_component_groups_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED, IN p_name VARCHAR(120), IN p_instructor_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_instructor_tenant_id BIGINT UNSIGNED;
  DECLARE v_instructor_role VARCHAR(80);

  SELECT p.tenant_id INTO v_program_tenant_id
  FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'component_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF p_instructor_id IS NOT NULL THEN
    SELECT u.tenant_id, v.code INTO v_instructor_tenant_id, v_instructor_role
    FROM users u JOIN master_catalog_values v ON v.id = u.role_id
    WHERE u.id = p_instructor_id AND u.is_deleted = FALSE;

    IF v_instructor_role IS NULL OR v_instructor_role <> 'instructor' OR v_instructor_tenant_id <> v_program_tenant_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_invalid';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM components c3 JOIN training_programs p3 ON p3.id = c3.program_id
      JOIN master_catalog_values ps3 ON ps3.id = p3.status_id WHERE c3.id = p_component_id AND ps3.code IN ('draft', 'active', 'paused')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_active';
    END IF;
    IF EXISTS (SELECT 1 FROM group_enrollments ge JOIN component_groups g4 ON g4.id = ge.group_id
      WHERE g4.component_id = p_component_id AND g4.is_deleted = FALSE AND ge.student_id = p_instructor_id AND ge.is_deleted = FALSE) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'enrolled_in_component';
    END IF;
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'COMPONENT_STATUS' AND v.code = 'pending';

  INSERT INTO component_groups (component_id, name, instructor_id, status_id, created_by)
  VALUES (p_component_id, p_name, p_instructor_id, v_status_id, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS group_id;
END$$

-- Renombrar y/o reasignar instructor. Si cambia de instructor, valida que
-- el nuevo no choque con el horario ya asignado a este grupo en cualquier
-- otro grupo suyo (misma regla que sp_group_schedule_days_add).
CREATE PROCEDURE sp_component_groups_update(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED, IN p_name VARCHAR(120), IN p_instructor_id BIGINT UNSIGNED,
  IN p_change_reason VARCHAR(30), IN p_change_note VARCHAR(500), IN p_effective_on DATE
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_instructor_tenant_id BIGINT UNSIGNED;
  DECLARE v_instructor_role VARCHAR(80);
  DECLARE v_previous_instructor_id BIGINT UNSIGNED;

  SELECT p.tenant_id INTO v_program_tenant_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF p_instructor_id IS NOT NULL THEN
    SELECT u.tenant_id, v.code INTO v_instructor_tenant_id, v_instructor_role
    FROM users u JOIN master_catalog_values v ON v.id = u.role_id
    WHERE u.id = p_instructor_id AND u.is_deleted = FALSE;

    IF v_instructor_role IS NULL OR v_instructor_role <> 'instructor' OR v_instructor_tenant_id <> v_program_tenant_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_invalid';
    END IF;

    IF NOT (p_instructor_id <=> (SELECT instructor_id FROM component_groups WHERE id = p_group_id)) THEN
      IF NOT EXISTS (SELECT 1 FROM component_groups g3 JOIN components c3 ON c3.id = g3.component_id
        JOIN training_programs p3 ON p3.id = c3.program_id JOIN master_catalog_values ps3 ON ps3.id = p3.status_id
        WHERE g3.id = p_group_id AND ps3.code IN ('draft', 'active', 'paused')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_active';
      END IF;
      IF EXISTS (SELECT 1 FROM group_enrollments ge JOIN component_groups g4 ON g4.id = ge.group_id
        WHERE g4.component_id = (SELECT component_id FROM component_groups WHERE id = p_group_id)
          AND g4.is_deleted = FALSE AND ge.student_id = p_instructor_id AND ge.is_deleted = FALSE) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'enrolled_in_component';
      END IF;
    END IF;

    -- Puede dictar varios componentes y programas: solo se impide el cruce
    -- real (misma fecha y hora) con sus clases de programas vigentes.
    IF EXISTS (
      SELECT 1 FROM topics t
      JOIN component_group_schedule_days d ON d.group_id = t.group_id AND d.is_deleted = FALSE AND d.weekday = DAYOFWEEK(t.scheduled_on) - 1
      JOIN component_groups g2 ON g2.instructor_id = p_instructor_id AND g2.id <> p_group_id AND g2.is_deleted = FALSE
      JOIN components c2 ON c2.id = g2.component_id AND c2.is_deleted = FALSE
      JOIN training_programs p2 ON p2.id = c2.program_id AND p2.is_deleted = FALSE
      JOIN master_catalog_values ps2 ON ps2.id = p2.status_id AND ps2.code IN ('draft', 'active', 'paused')
      JOIN topics t2 ON t2.group_id = g2.id AND t2.is_deleted = FALSE AND t2.scheduled_on = t.scheduled_on
      JOIN component_group_schedule_days d2 ON d2.group_id = g2.id AND d2.is_deleted = FALSE AND d2.weekday = d.weekday
      WHERE t.group_id = p_group_id AND t.is_deleted = FALSE AND t.scheduled_on IS NOT NULL
        AND NOT (d.end_time <= d2.start_time OR d.start_time >= d2.end_time)
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_schedule_conflict';
    END IF;
  END IF;

  SELECT instructor_id INTO v_previous_instructor_id FROM component_groups WHERE id = p_group_id;
  IF v_previous_instructor_id IS NOT NULL AND NOT (v_previous_instructor_id <=> p_instructor_id) THEN
    IF COALESCE(p_change_reason, 'reassignment') NOT IN ('resignation', 'absences', 'reassignment', 'performance', 'personal', 'other') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_change_reason';
    END IF;
    INSERT INTO instructor_changes (tenant_id, group_id, previous_instructor_id, new_instructor_id, reason_code, note, effective_on, created_by)
    VALUES (v_program_tenant_id, p_group_id, v_previous_instructor_id, p_instructor_id, COALESCE(p_change_reason, 'reassignment'),
            NULLIF(TRIM(p_change_note), ''), COALESCE(p_effective_on, CURDATE()), p_actor_user_id);
  END IF;

  UPDATE component_groups
  SET name = COALESCE(NULLIF(p_name, ''), name), instructor_id = p_instructor_id,
      updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_group_id;
END$$

CREATE PROCEDURE sp_group_enrollments_add(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED, IN p_student_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_id BIGINT UNSIGNED;
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_student_tenant_id BIGINT UNSIGNED;
  DECLARE v_student_role VARCHAR(80);

  SELECT c.program_id, p.tenant_id INTO v_program_id, v_program_tenant_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT u.tenant_id, v.code INTO v_student_tenant_id, v_student_role
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id
  WHERE u.id = p_student_id AND u.is_deleted = FALSE;

  IF v_student_role IS NULL OR v_student_role NOT IN ('student', 'instructor', 'tenant_admin', 'super_admin')
     OR (v_student_role <> 'super_admin' AND NOT (v_student_tenant_id <=> v_program_tenant_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'student_invalid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM program_enrollments WHERE program_id = v_program_id AND student_id = p_student_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'student_not_enrolled_in_program';
  END IF;

  IF EXISTS (SELECT 1 FROM group_enrollments WHERE group_id = p_group_id AND student_id = p_student_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'already_enrolled';
  END IF;
  -- Nadie cursa un componente que dicta.
  IF EXISTS (SELECT 1 FROM component_groups g2 WHERE g2.is_deleted = FALSE AND g2.instructor_id = p_student_id
    AND g2.component_id = (SELECT component_id FROM component_groups WHERE id = p_group_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'teaches_this_component';
  END IF;
  -- Ni cruza sus clases (las que dicta o cursa) a la misma fecha y hora.
  IF EXISTS (
    SELECT 1 FROM topics tc
    JOIN component_group_schedule_days dc ON dc.group_id = tc.group_id AND dc.is_deleted = FALSE AND dc.weekday = DAYOFWEEK(tc.scheduled_on) - 1
    JOIN topics tx ON tx.scheduled_on = tc.scheduled_on AND tx.is_deleted = FALSE AND tx.group_id <> tc.group_id
    JOIN component_groups gx ON gx.id = tx.group_id AND gx.is_deleted = FALSE
    JOIN components cx ON cx.id = gx.component_id AND cx.is_deleted = FALSE
    JOIN training_programs px ON px.id = cx.program_id AND px.is_deleted = FALSE
    JOIN master_catalog_values psx ON psx.id = px.status_id AND psx.code IN ('draft', 'active', 'paused')
    JOIN component_group_schedule_days dx ON dx.group_id = gx.id AND dx.is_deleted = FALSE AND dx.weekday = dc.weekday
    WHERE tc.group_id = p_group_id AND tc.is_deleted = FALSE AND tc.scheduled_on IS NOT NULL
      AND NOT (dc.end_time <= dx.start_time OR dc.start_time >= dx.end_time)
      AND (gx.instructor_id = p_student_id OR EXISTS (SELECT 1 FROM group_enrollments gex
        WHERE gex.group_id = gx.id AND gex.student_id = p_student_id AND gex.is_deleted = FALSE))
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'schedule_clash';
  END IF;

  INSERT INTO group_enrollments (group_id, student_id, created_by) VALUES (p_group_id, p_student_id, p_actor_user_id);
END$$

CREATE PROCEDURE sp_topics_list(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_group_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT p.tenant_id INTO v_program_tenant_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;
  IF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  SELECT t.id, t.group_id, t.title, t.description, t.sort_order, t.scheduled_on, t.actual_date,
         t.duration_minutes, ts.code AS status_code, ts.label AS status_label
  FROM topics t
  JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE t.group_id = p_group_id AND t.is_deleted = FALSE
  ORDER BY t.sort_order, t.scheduled_on;
END$$

-- Todo el temario de TODOS los grupos de un programa en una sola llamada
-- (con nombre de componente/grupo/instructor ya resueltos): alimenta la
-- vista de calendario semana por semana con datos reales.
CREATE PROCEDURE sp_topics_list_by_program(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_program_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  SELECT t.id, t.title, t.scheduled_on, t.duration_minutes, ts.code AS status_code, ts.label AS status_label,
         g.id AS group_id, g.name AS group_name, g.instructor_id, iu.full_name AS instructor_name,
         c.id AS component_id, c.name AS component_name
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id
  JOIN components c ON c.id = g.component_id
  JOIN master_catalog_values ts ON ts.id = t.status_id
  LEFT JOIN users iu ON iu.id = g.instructor_id
  WHERE c.program_id = p_program_id AND t.is_deleted = FALSE AND g.is_deleted = FALSE AND c.is_deleted = FALSE
  ORDER BY t.scheduled_on, c.sort_order, g.name;
END$$

-- La fecha propuesta no puede caer en un feriado activo del tenant: la regla
-- de calendario vive aqui, no en la API ni en el frontend.
CREATE PROCEDURE sp_topics_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED, IN p_title VARCHAR(180), IN p_description TEXT,
  IN p_sort_order INT, IN p_scheduled_on DATE, IN p_duration_minutes INT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;

  SELECT p.tenant_id INTO v_program_tenant_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;

  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF p_scheduled_on IS NOT NULL AND EXISTS (
    SELECT 1 FROM holidays h WHERE h.tenant_id = v_program_tenant_id AND h.holiday_on = p_scheduled_on AND h.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_is_holiday';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'TOPIC_STATUS' AND v.code = IF(p_scheduled_on IS NULL, 'pending', 'scheduled');

  INSERT INTO topics (group_id, title, description, sort_order, scheduled_on, duration_minutes, status_id, created_by)
  VALUES (p_group_id, p_title, p_description, COALESCE(p_sort_order, 0), p_scheduled_on, p_duration_minutes, v_status_id, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS topic_id;
END$$

-- El instructor del grupo (o un admin de su tenant) puede marcar el tema
-- como iniciado/completado/adelantado y registrar la fecha real.
CREATE PROCEDURE sp_topics_update_status(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_topic_id BIGINT UNSIGNED, IN p_status_code VARCHAR(80), IN p_actual_date DATE
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_group_instructor_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_authorized BOOLEAN DEFAULT FALSE;

  SELECT p.tenant_id, g.instructor_id INTO v_program_tenant_id, v_group_instructor_id
  FROM topics t JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;

  IF p_actor_role = 'instructor' AND p_actor_user_id = v_group_instructor_id THEN
    SET v_authorized = TRUE;
  ELSEIF p_actor_role = 'tenant_admin' AND v_program_tenant_id = p_actor_tenant_id THEN
    SET v_authorized = TRUE;
  ELSEIF p_actor_role = 'super_admin' THEN
    SET v_authorized = TRUE;
  END IF;

  IF NOT v_authorized THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'TOPIC_STATUS' AND v.code = p_status_code AND v.is_active = TRUE;
  IF v_status_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;

  UPDATE topics
  SET status_id = v_status_id, actual_date = COALESCE(p_actual_date, actual_date),
      updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_topic_id;
END$$

-- ===================================================================
-- Horario semanal recurrente de un grupo y generador automatico de fechas
-- del temario. Reglas de negocio (dias del grupo, feriados, choques de
-- instructor) resueltas por completo en SQL; la API solo dispara el SP.
-- ===================================================================
CREATE PROCEDURE sp_group_schedule_days_list(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_group_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT p.tenant_id INTO v_program_tenant_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;
  IF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  SELECT id, weekday, start_time, end_time
  FROM component_group_schedule_days
  WHERE group_id = p_group_id AND is_deleted = FALSE
  ORDER BY weekday;
END$$

-- Rechaza el horario si el instructor del grupo ya tiene OTRO grupo (de
-- cualquier componente) con horario que se solape ese mismo dia. Esta es
-- la regla dura de "los instructores no se cruzan".
CREATE PROCEDURE sp_group_schedule_days_add(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED, IN p_weekday TINYINT UNSIGNED, IN p_start_time TIME, IN p_end_time TIME
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_instructor_id BIGINT UNSIGNED;

  SELECT p.tenant_id, g.instructor_id INTO v_program_tenant_id, v_instructor_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF p_weekday IS NULL OR p_weekday > 6 OR p_start_time IS NULL OR p_end_time IS NULL OR p_start_time >= p_end_time THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_schedule_day';
  END IF;

  IF v_instructor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM topics t
    JOIN component_groups g2 ON g2.instructor_id = v_instructor_id AND g2.id <> p_group_id AND g2.is_deleted = FALSE
    JOIN components c2 ON c2.id = g2.component_id AND c2.is_deleted = FALSE
    JOIN training_programs p2 ON p2.id = c2.program_id AND p2.is_deleted = FALSE
    JOIN master_catalog_values ps2 ON ps2.id = p2.status_id AND ps2.code IN ('draft', 'active', 'paused')
    JOIN topics t2 ON t2.group_id = g2.id AND t2.is_deleted = FALSE AND t2.scheduled_on = t.scheduled_on
    JOIN component_group_schedule_days d ON d.group_id = g2.id AND d.is_deleted = FALSE AND d.weekday = p_weekday
    WHERE t.group_id = p_group_id AND t.is_deleted = FALSE AND DAYOFWEEK(t.scheduled_on) - 1 = p_weekday
      AND NOT (p_end_time <= d.start_time OR p_start_time >= d.end_time)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_schedule_conflict';
  END IF;

  INSERT INTO component_group_schedule_days (group_id, weekday, start_time, end_time, created_by)
  VALUES (p_group_id, p_weekday, p_start_time, p_end_time, p_actor_user_id)
  ON DUPLICATE KEY UPDATE start_time = p_start_time, end_time = p_end_time, is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL;
END$$

CREATE PROCEDURE sp_group_schedule_days_remove(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED, IN p_weekday TINYINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT p.tenant_id INTO v_program_tenant_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  UPDATE component_group_schedule_days
  SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id
  WHERE group_id = p_group_id AND weekday = p_weekday;
END$$

-- Genera scheduled_on para los temas pendientes/programados de un GRUPO, en
-- orden, saltando dias fuera de su horario, feriados del tenant y fechas
-- donde su instructor ya tiene otro tema asignado (en cualquier grupo suyo,
-- de cualquier componente). Los temas ya iniciados/completados/cancelados
-- no se tocan.
CREATE PROCEDURE sp_topics_generate_schedule(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED, IN p_start_date DATE
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_instructor_id BIGINT UNSIGNED;
  DECLARE v_schedule_day_count INT;
  DECLARE v_scheduled_status_id BIGINT UNSIGNED;
  DECLARE v_cursor DATE;
  DECLARE v_safety INT DEFAULT 0;
  DECLARE v_found BOOLEAN;
  DECLARE v_topic_id BIGINT UNSIGNED;
  DECLARE v_topic_done BOOLEAN DEFAULT FALSE;
  DECLARE v_assigned_count INT DEFAULT 0;
  DECLARE topic_cursor CURSOR FOR
    SELECT t.id FROM topics t JOIN master_catalog_values ts ON ts.id = t.status_id
    WHERE t.group_id = p_group_id AND t.is_deleted = FALSE AND ts.code IN ('pending', 'scheduled')
    ORDER BY t.sort_order, t.id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_topic_done = TRUE;

  SELECT p.tenant_id, g.instructor_id INTO v_program_tenant_id, v_instructor_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT COUNT(*) INTO v_schedule_day_count FROM component_group_schedule_days WHERE group_id = p_group_id AND is_deleted = FALSE;
  IF v_schedule_day_count = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'schedule_not_configured';
  END IF;

  SELECT v.id INTO v_scheduled_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'TOPIC_STATUS' AND v.code = 'scheduled';

  SET v_cursor = COALESCE(p_start_date, CURDATE());

  OPEN topic_cursor;
  topic_loop: LOOP
    FETCH topic_cursor INTO v_topic_id;
    IF v_topic_done THEN LEAVE topic_loop; END IF;

    SET v_found = FALSE;
    day_loop: WHILE v_safety < 3650 DO
      SET v_safety = v_safety + 1;

      IF EXISTS (
           SELECT 1 FROM component_group_schedule_days
           WHERE group_id = p_group_id AND weekday = (DAYOFWEEK(v_cursor) - 1) AND is_deleted = FALSE
         )
         AND NOT EXISTS (
           SELECT 1 FROM holidays WHERE tenant_id = v_program_tenant_id AND holiday_on = v_cursor AND is_deleted = FALSE
         )
         AND (v_instructor_id IS NULL OR NOT EXISTS (
           SELECT 1 FROM topics t2 JOIN component_groups g2 ON g2.id = t2.group_id
           WHERE g2.instructor_id = v_instructor_id AND t2.scheduled_on = v_cursor
             AND t2.is_deleted = FALSE AND t2.id <> v_topic_id
         ))
      THEN
        UPDATE topics
        SET scheduled_on = v_cursor, status_id = v_scheduled_status_id, updated_at = NOW(), updated_by = p_actor_user_id
        WHERE id = v_topic_id;
        SET v_assigned_count = v_assigned_count + 1;
        SET v_found = TRUE;
        SET v_cursor = DATE_ADD(v_cursor, INTERVAL 1 DAY);
        LEAVE day_loop;
      END IF;

      SET v_cursor = DATE_ADD(v_cursor, INTERVAL 1 DAY);
    END WHILE day_loop;

    IF NOT v_found THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'schedule_generation_failed';
    END IF;
  END LOOP topic_loop;
  CLOSE topic_cursor;

  SELECT v_assigned_count AS topics_scheduled;
END$$

-- Reprogramacion puntual de un tema (por ejemplo, tras registrar un feriado
-- nuevo sobre una fecha ya asignada). Respeta las mismas reglas de calendario
-- y de disponibilidad del instructor del grupo.
CREATE PROCEDURE sp_topics_reschedule(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_topic_id BIGINT UNSIGNED, IN p_new_date DATE
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_instructor_id BIGINT UNSIGNED;
  DECLARE v_rescheduled_status_id BIGINT UNSIGNED;

  SELECT p.tenant_id, g.instructor_id INTO v_program_tenant_id, v_instructor_id
  FROM topics t JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF EXISTS (SELECT 1 FROM holidays WHERE tenant_id = v_program_tenant_id AND holiday_on = p_new_date AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_is_holiday';
  END IF;

  IF v_instructor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM topics t2 JOIN component_groups g2 ON g2.id = t2.group_id AND g2.is_deleted = FALSE
    JOIN components c2 ON c2.id = g2.component_id AND c2.is_deleted = FALSE
    JOIN training_programs p2 ON p2.id = c2.program_id AND p2.is_deleted = FALSE
    JOIN master_catalog_values ps2 ON ps2.id = p2.status_id AND ps2.code IN ('draft', 'active', 'paused')
    WHERE g2.instructor_id = v_instructor_id AND t2.scheduled_on = p_new_date AND t2.is_deleted = FALSE AND t2.id <> p_topic_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_not_available';
  END IF;

  SELECT v.id INTO v_rescheduled_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'TOPIC_STATUS' AND v.code = 'rescheduled';

  UPDATE topics
  SET scheduled_on = p_new_date, status_id = v_rescheduled_status_id, updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_topic_id;
END$$

CREATE PROCEDURE sp_holidays_list(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_scope_tenant_id BIGINT UNSIGNED;
  SET v_scope_tenant_id = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT h.id, h.tenant_id, h.holiday_on, h.name, ht.code AS type_code, ht.label AS type_label
  FROM holidays h
  LEFT JOIN master_catalog_values ht ON ht.id = h.type_id
  WHERE h.is_deleted = FALSE
    AND (v_scope_tenant_id IS NULL OR h.tenant_id = v_scope_tenant_id)
  ORDER BY h.holiday_on;
END$$

CREATE PROCEDURE sp_holidays_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_tenant_id BIGINT UNSIGNED, IN p_holiday_on DATE, IN p_name VARCHAR(160), IN p_type_code VARCHAR(80)
)
BEGIN
  DECLARE v_type_id BIGINT UNSIGNED;

  IF p_actor_role = 'tenant_admin' THEN
    IF p_tenant_id IS NULL OR p_tenant_id <> p_actor_tenant_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
    END IF;
  ELSEIF p_actor_role <> 'super_admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM holidays WHERE tenant_id = p_tenant_id AND holiday_on = p_holiday_on AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'holiday_already_exists';
  END IF;

  IF p_type_code IS NOT NULL THEN
    SELECT v.id INTO v_type_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
    WHERE c.code = 'HOLIDAY_TYPE' AND v.code = p_type_code;
  END IF;

  INSERT INTO holidays (tenant_id, holiday_on, name, type_id, created_by)
  VALUES (p_tenant_id, p_holiday_on, p_name, v_type_id, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS holiday_id;
END$$

-- ===================================================================
-- Alertas: no hay job/cron disponible, asi que la deteccion se dispara a
-- demanda desde la UI ("Detectar alertas"). Cada regla es un INSERT...SELECT
-- set-based que evita duplicar una alerta mientras siga abierta para la
-- misma entidad de origen (type_id + source_type + source_id).
-- ===================================================================
CREATE PROCEDURE sp_alerts_run_detection(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  DECLARE v_open_status_id BIGINT UNSIGNED;
  DECLARE v_before INT;
  DECLARE v_after INT;

  IF p_actor_role = 'tenant_admin' THEN
    SET v_tenant_filter = p_actor_tenant_id;
  ELSEIF p_actor_role = 'super_admin' THEN
    SET v_tenant_filter = NULL;
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT v.id INTO v_open_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'ALERT_STATUS' AND v.code = 'open';

  SELECT COUNT(*) INTO v_before FROM alerts WHERE is_deleted = FALSE;

  -- 1) Temas atrasados: fecha programada ya paso y el tema sigue sin completarse/cancelarse.
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT p.tenant_id,
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_TYPE' AND v.code = 'topic_delayed'),
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_PRIORITY' AND v.code = 'high'),
    g.instructor_id,
    CONCAT('Tema atrasado: ', t.title),
    CONCAT('El tema "', t.title, '" de "', c.name, '" (', g.name, ') estaba programado para el ', t.scheduled_on, ' y sigue sin completarse.'),
    v_open_status_id, 'topic', t.id, p_actor_user_id
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE t.is_deleted = FALSE AND t.scheduled_on IS NOT NULL AND t.scheduled_on < CURDATE()
    AND ts.code NOT IN ('completed', 'cancelled')
    AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
    AND NOT EXISTS (
      SELECT 1 FROM alerts a JOIN master_catalog_values ast ON ast.id = a.status_id
      JOIN master_catalog_values at2 ON at2.id = a.type_id
      WHERE a.source_type = 'topic' AND a.source_id = t.id AND at2.code = 'topic_delayed' AND ast.code = 'open' AND a.is_deleted = FALSE
    );

  -- 2) Grupos activos sin instructor asignado.
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT p.tenant_id,
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_TYPE' AND v.code = 'program_without_instructor'),
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_PRIORITY' AND v.code = 'medium'),
    NULL,
    CONCAT('Grupo sin instructor: ', c.name, ' - ', g.name),
    CONCAT('El grupo "', g.name, '" de "', c.name, '" (programa "', p.name, '") no tiene instructor asignado.'),
    v_open_status_id, 'component_group', g.id, p_actor_user_id
  FROM component_groups g
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values ps ON ps.id = p.status_id
  WHERE g.is_deleted = FALSE AND g.instructor_id IS NULL AND ps.code = 'active'
    AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
    AND NOT EXISTS (
      SELECT 1 FROM alerts a JOIN master_catalog_values ast ON ast.id = a.status_id
      JOIN master_catalog_values at2 ON at2.id = a.type_id
      WHERE a.source_type = 'component_group' AND a.source_id = g.id AND at2.code = 'program_without_instructor' AND ast.code = 'open' AND a.is_deleted = FALSE
    );

  -- 3) Grupos activos sin alumnos inscritos.
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT p.tenant_id,
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_TYPE' AND v.code = 'component_without_students'),
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_PRIORITY' AND v.code = 'low'),
    NULL,
    CONCAT('Grupo sin alumnos: ', c.name, ' - ', g.name),
    CONCAT('El grupo "', g.name, '" de "', c.name, '" (programa "', p.name, '") no tiene alumnos inscritos.'),
    v_open_status_id, 'component_group', g.id, p_actor_user_id
  FROM component_groups g
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values ps ON ps.id = p.status_id
  WHERE g.is_deleted = FALSE AND ps.code = 'active'
    AND NOT EXISTS (SELECT 1 FROM group_enrollments ge WHERE ge.group_id = g.id AND ge.is_deleted = FALSE)
    AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
    AND NOT EXISTS (
      SELECT 1 FROM alerts a JOIN master_catalog_values ast ON ast.id = a.status_id
      JOIN master_catalog_values at2 ON at2.id = a.type_id
      WHERE a.source_type = 'component_group' AND a.source_id = g.id AND at2.code = 'component_without_students' AND ast.code = 'open' AND a.is_deleted = FALSE
    );

  -- 4) Alumnos con 3 o mas inasistencias no justificadas.
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT su.tenant_id,
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_TYPE' AND v.code = 'multiple_absences'),
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_PRIORITY' AND v.code = 'high'),
    su.id,
    CONCAT('Alumno con inasistencias: ', su.full_name),
    CONCAT(su.full_name, ' acumula ', absence_counts.total, ' inasistencias no justificadas.'),
    v_open_status_id, 'student', su.id, p_actor_user_id
  FROM (
    SELECT a.student_id, COUNT(*) AS total
    FROM attendance a JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
    WHERE ast.code = 'absent' AND a.is_deleted = FALSE
    GROUP BY a.student_id
    HAVING COUNT(*) >= 3
  ) absence_counts
  JOIN users su ON su.id = absence_counts.student_id
  WHERE (v_tenant_filter IS NULL OR su.tenant_id = v_tenant_filter)
    AND NOT EXISTS (
      SELECT 1 FROM alerts a JOIN master_catalog_values ast ON ast.id = a.status_id
      JOIN master_catalog_values at2 ON at2.id = a.type_id
      WHERE a.source_type = 'student' AND a.source_id = su.id AND at2.code = 'multiple_absences' AND ast.code = 'open' AND a.is_deleted = FALSE
    );

  -- 5) Solicitudes de permiso pendientes hace mas de 2 dias.
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT su.tenant_id,
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_TYPE' AND v.code = 'leave_pending'),
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_PRIORITY' AND v.code = 'medium'),
    NULL,
    CONCAT('Permiso pendiente: ', su.full_name),
    CONCAT('La solicitud de ', su.full_name, ' (', l.starts_on, ' a ', l.ends_on, ') lleva mas de 2 dias sin resolverse.'),
    v_open_status_id, 'leave_request', l.id, p_actor_user_id
  FROM leave_requests l
  JOIN users su ON su.id = l.student_id
  JOIN master_catalog_values ls ON ls.id = l.status_id
  WHERE ls.code = 'pending' AND l.is_deleted = FALSE AND l.created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)
    AND (v_tenant_filter IS NULL OR su.tenant_id = v_tenant_filter)
    AND NOT EXISTS (
      SELECT 1 FROM alerts a JOIN master_catalog_values ast ON ast.id = a.status_id
      JOIN master_catalog_values at2 ON at2.id = a.type_id
      WHERE a.source_type = 'leave_request' AND a.source_id = l.id AND at2.code = 'leave_pending' AND ast.code = 'open' AND a.is_deleted = FALSE
    );

  -- 6) Tenants inactivos o suspendidos: solo el super_admin corre esta regla (vision global de plataforma).
  IF p_actor_role = 'super_admin' THEN
    INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
    SELECT t.id,
      (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_TYPE' AND v.code = 'tenant_inactive'),
      (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_PRIORITY' AND v.code = 'critical'),
      NULL,
      CONCAT('Tenant inactivo: ', t.name),
      CONCAT('El tenant "', t.name, '" esta en estado "', ts.label, '".'),
      v_open_status_id, 'tenant', t.id, p_actor_user_id
    FROM tenants t
    JOIN master_catalog_values ts ON ts.id = t.status_id
    WHERE ts.code IN ('inactive', 'suspended') AND t.is_deleted = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM alerts a JOIN master_catalog_values ast ON ast.id = a.status_id
        JOIN master_catalog_values at2 ON at2.id = a.type_id
        WHERE a.source_type = 'tenant' AND a.source_id = t.id AND at2.code = 'tenant_inactive' AND ast.code = 'open' AND a.is_deleted = FALSE
      );
  END IF;

  SELECT COUNT(*) INTO v_after FROM alerts WHERE is_deleted = FALSE;
  SELECT (v_after - v_before) AS alerts_created;
END$$

CREATE PROCEDURE sp_alerts_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  SELECT a.id, a.tenant_id, at2.code AS type_code, at2.label AS type_label,
         ap.code AS priority_code, ap.label AS priority_label, ap.sort_order AS priority_rank,
         a.title, a.description, ast.code AS status_code, ast.label AS status_label,
         a.recipient_user_id, a.generated_at, a.read_at
  FROM alerts a
  JOIN master_catalog_values at2 ON at2.id = a.type_id
  JOIN master_catalog_values ap ON ap.id = a.priority_id
  JOIN master_catalog_values ast ON ast.id = a.status_id
  WHERE a.is_deleted = FALSE
    AND (
      p_actor_role = 'super_admin'
      OR (p_actor_role = 'tenant_admin' AND a.tenant_id = p_actor_tenant_id)
      OR (p_actor_role IN ('instructor', 'student') AND a.recipient_user_id = p_actor_user_id)
    )
  ORDER BY (ast.code = 'open') DESC, ap.sort_order DESC, a.generated_at DESC;
END$$

CREATE PROCEDURE sp_alerts_mark_read(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_alert_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_recipient_user_id BIGINT UNSIGNED;
  DECLARE v_found INT DEFAULT 0;
  DECLARE v_read_status_id BIGINT UNSIGNED;
  DECLARE v_authorized BOOLEAN DEFAULT FALSE;

  SELECT COUNT(*), MAX(tenant_id), MAX(recipient_user_id) INTO v_found, v_tenant_id, v_recipient_user_id
  FROM alerts WHERE id = p_alert_id AND is_deleted = FALSE;

  IF v_found = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;

  IF p_actor_role = 'super_admin' THEN
    SET v_authorized = TRUE;
  ELSEIF p_actor_role = 'tenant_admin' AND v_tenant_id = p_actor_tenant_id THEN
    SET v_authorized = TRUE;
  ELSEIF p_actor_role IN ('instructor', 'student') AND v_recipient_user_id = p_actor_user_id THEN
    SET v_authorized = TRUE;
  END IF;
  IF NOT v_authorized THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT v.id INTO v_read_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'ALERT_STATUS' AND v.code = 'read';

  UPDATE alerts
  SET status_id = v_read_status_id, read_at = NOW(), read_by = p_actor_user_id, updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_alert_id;
END$$

CREATE PROCEDURE sp_users_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_target_tenant_id BIGINT UNSIGNED, IN p_full_name VARCHAR(160), IN p_email VARCHAR(190),
  IN p_password_hash VARCHAR(255), IN p_role_code VARCHAR(80)
)
BEGIN
  DECLARE v_role_id BIGINT UNSIGNED;
  DECLARE v_tenant_status_code VARCHAR(80);

  IF p_actor_role = 'super_admin' THEN
    -- El super_admin puede operar cualquier tenant directamente (crear
    -- tenant_admin, instructor o alumno), no solo delegar en un tenant_admin.
    IF p_role_code NOT IN ('super_admin', 'tenant_admin', 'instructor', 'student') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'role_not_allowed_for_actor';
    END IF;
    IF p_role_code <> 'super_admin' AND p_target_tenant_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_required';
    END IF;
  ELSEIF p_actor_role = 'tenant_admin' THEN
    IF p_role_code NOT IN ('instructor', 'student') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'role_not_allowed_for_actor';
    END IF;
    IF p_target_tenant_id IS NULL OR p_target_tenant_id <> p_actor_tenant_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
    END IF;
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF p_target_tenant_id IS NOT NULL THEN
    SELECT ts.code INTO v_tenant_status_code
    FROM tenants t JOIN master_catalog_values ts ON ts.id = t.status_id
    WHERE t.id = p_target_tenant_id AND t.is_deleted = FALSE;

    IF v_tenant_status_code IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_not_found';
    ELSEIF v_tenant_status_code <> 'active' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_inactive';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE email = p_email AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'email_already_exists';
  END IF;

  SELECT v.id INTO v_role_id
  FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'ROLE' AND v.code = p_role_code;

  INSERT INTO users (tenant_id, full_name, email, password_hash, role_id, is_active, must_change_password, created_by)
  VALUES (p_target_tenant_id, p_full_name, p_email, p_password_hash, v_role_id, TRUE, TRUE, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS user_id;
END$$

CREATE PROCEDURE sp_users_set_active(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_target_user_id BIGINT UNSIGNED, IN p_is_active BOOLEAN
)
BEGIN
  DECLARE v_target_tenant_id BIGINT UNSIGNED;
  DECLARE v_target_role VARCHAR(80);

  SELECT u.tenant_id, v.code INTO v_target_tenant_id, v_target_role
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id
  WHERE u.id = p_target_user_id AND u.is_deleted = FALSE;

  IF v_target_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  ELSEIF p_actor_role = 'super_admin' THEN
    UPDATE users SET is_active = p_is_active, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_target_user_id;
  ELSEIF p_actor_role = 'tenant_admin' AND v_target_role IN ('instructor', 'student')
      AND v_target_tenant_id IS NOT NULL AND v_target_tenant_id = p_actor_tenant_id THEN
    UPDATE users SET is_active = p_is_active, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_target_user_id;
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
END$$

-- ===================================================================
-- Asistencia: solo el instructor a cargo del componente (o un admin de su
-- tenant) puede tomar asistencia, y solo de alumnos inscritos en ese
-- componente. Upsert: corregir una marca ya tomada no crea un duplicado.
-- ===================================================================
CREATE PROCEDURE sp_attendance_upsert(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_topic_id BIGINT UNSIGNED, IN p_student_id BIGINT UNSIGNED,
  IN p_status_code VARCHAR(80), IN p_reason_code VARCHAR(80), IN p_observations VARCHAR(500)
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_group_id BIGINT UNSIGNED;
  DECLARE v_group_instructor_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_reason_id BIGINT UNSIGNED;
  DECLARE v_authorized BOOLEAN DEFAULT FALSE;

  SELECT p.tenant_id, g.id, g.instructor_id INTO v_program_tenant_id, v_group_id, v_group_instructor_id
  FROM topics t JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;

  IF p_actor_role = 'instructor' AND p_actor_user_id = v_group_instructor_id THEN
    SET v_authorized = TRUE;
  ELSEIF p_actor_role = 'tenant_admin' AND v_program_tenant_id = p_actor_tenant_id THEN
    SET v_authorized = TRUE;
  ELSEIF p_actor_role = 'super_admin' THEN
    SET v_authorized = TRUE;
  END IF;
  IF NOT v_authorized THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM group_enrollments WHERE group_id = v_group_id AND student_id = p_student_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'student_not_enrolled_in_program';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'ATTENDANCE_STATUS' AND v.code = p_status_code AND v.is_active = TRUE;
  IF v_status_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;

  IF p_reason_code IS NOT NULL THEN
    SELECT v.id INTO v_reason_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
    WHERE c.code = 'ABSENCE_REASON' AND v.code = p_reason_code;
  END IF;

  INSERT INTO attendance (topic_id, student_id, attendance_status_id, reason_id, observations, created_by)
  VALUES (p_topic_id, p_student_id, v_status_id, v_reason_id, p_observations, p_actor_user_id)
  ON DUPLICATE KEY UPDATE
    attendance_status_id = v_status_id, reason_id = v_reason_id, observations = p_observations,
    updated_at = NOW(), updated_by = p_actor_user_id;
END$$

CREATE PROCEDURE sp_attendance_list_by_topic(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_actor_user_id BIGINT UNSIGNED, IN p_topic_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_group_instructor_id BIGINT UNSIGNED;

  SELECT p.tenant_id, g.instructor_id INTO v_program_tenant_id, v_group_instructor_id
  FROM topics t JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role = 'instructor' AND p_actor_user_id <> v_group_instructor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  SELECT ge.student_id, su.full_name AS student_name, su.is_active AS student_is_active, a.id AS attendance_id,
         ast.code AS status_code, ast.label AS status_label,
         ar.code AS reason_code, ar.label AS reason_label, a.observations,
         -- Aviso de inasistencia vigente del alumno para esta clase.
         (SELECT ls.code FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id
          WHERE l.student_id = ge.student_id AND l.is_deleted = FALSE AND ls.code IN ('pending', 'approved')
            AND (l.topic_id = t.id OR (l.topic_id IS NULL AND t.scheduled_on BETWEEN l.starts_on AND l.ends_on))
          ORDER BY ls.code = 'approved' DESC, l.created_at DESC LIMIT 1) AS leave_status_code,
         (SELECT l.reason FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id
          WHERE l.student_id = ge.student_id AND l.is_deleted = FALSE AND ls.code IN ('pending', 'approved')
            AND (l.topic_id = t.id OR (l.topic_id IS NULL AND t.scheduled_on BETWEEN l.starts_on AND l.ends_on))
          ORDER BY ls.code = 'approved' DESC, l.created_at DESC LIMIT 1) AS leave_reason
  FROM group_enrollments ge
  JOIN users su ON su.id = ge.student_id AND su.is_active = TRUE AND su.is_deleted = FALSE
  JOIN topics t ON t.id = p_topic_id
  LEFT JOIN attendance a ON a.topic_id = p_topic_id AND a.student_id = ge.student_id AND a.is_deleted = FALSE
  LEFT JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
  LEFT JOIN master_catalog_values ar ON ar.id = a.reason_id
  WHERE ge.group_id = t.group_id AND ge.is_deleted = FALSE
  ORDER BY su.full_name;
END$$

CREATE PROCEDURE sp_attendance_list_by_student(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_actor_user_id BIGINT UNSIGNED, IN p_student_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_student_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_student_tenant_id FROM users WHERE id = p_student_id AND is_deleted = FALSE;

  IF v_student_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;

  IF p_actor_role = 'student' AND p_actor_user_id <> p_student_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role IN ('tenant_admin', 'instructor') AND v_student_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  SELECT a.id, a.topic_id, t.title AS topic_title, t.scheduled_on,
         ast.code AS status_code, ast.label AS status_label,
         ar.label AS reason_label, a.observations
  FROM attendance a
  JOIN topics t ON t.id = a.topic_id
  JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
  LEFT JOIN master_catalog_values ar ON ar.id = a.reason_id
  WHERE a.student_id = p_student_id AND a.is_deleted = FALSE
  ORDER BY t.scheduled_on DESC;
END$$

-- ===================================================================
-- Permisos: el alumno crea su propia solicitud; un admin de su tenant
-- (o super_admin) la aprueba o rechaza. No hay envio de correo: el estado
-- se consulta dentro de la app.
-- ===================================================================
CREATE PROCEDURE sp_leave_requests_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80),
  IN p_starts_on DATE, IN p_ends_on DATE, IN p_reason VARCHAR(500),
  IN p_leave_type_code VARCHAR(80), IN p_evidence_url VARCHAR(500), IN p_topic_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_type_id BIGINT UNSIGNED;
  DECLARE v_topic_date DATE;
  DECLARE v_leave_id BIGINT UNSIGNED;

  IF p_actor_role <> 'student' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  -- Aviso para una clase concreta: el alumno debe estar inscrito en su
  -- grupo, la clase debe tener fecha y no puede haber otro aviso vigente.
  IF p_topic_id IS NOT NULL THEN
    SELECT t.scheduled_on INTO v_topic_date
    FROM topics t
    JOIN group_enrollments ge ON ge.group_id = t.group_id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
    WHERE t.id = p_topic_id AND t.is_deleted = FALSE;
    IF v_topic_date IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
    END IF;
    IF EXISTS (
      SELECT 1 FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id
      WHERE l.student_id = p_actor_user_id AND l.topic_id = p_topic_id AND l.is_deleted = FALSE AND ls.code IN ('pending', 'approved')
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'leave_already_requested';
    END IF;
    SET p_starts_on = v_topic_date, p_ends_on = v_topic_date;
  END IF;

  IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_starts_on > p_ends_on THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_date_range';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'LEAVE_STATUS' AND v.code = 'pending';

  IF p_leave_type_code IS NOT NULL THEN
    SELECT v.id INTO v_type_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
    WHERE c.code = 'LEAVE_TYPE' AND v.code = p_leave_type_code;
  END IF;

  INSERT INTO leave_requests (student_id, topic_id, starts_on, ends_on, reason, leave_type_id, evidence_url, status_id, created_by)
  VALUES (p_actor_user_id, p_topic_id, p_starts_on, p_ends_on, p_reason, v_type_id, p_evidence_url, v_status_id, p_actor_user_id);
  SET v_leave_id = LAST_INSERT_ID();

  -- Avisa a cada instructor que dicta alguna de las clases afectadas
  -- (la clase indicada, o las del rango de fechas en los grupos del alumno).
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT su.tenant_id,
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_TYPE' AND v.code = 'absence_notice'),
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_PRIORITY' AND v.code = 'medium'),
         g.instructor_id,
         LEFT(CONCAT(su.full_name, ' avisó que no asistirá'), 200),
         LEFT(CONCAT(GROUP_CONCAT(CONCAT(DATE_FORMAT(t.scheduled_on, '%d/%m'), ' · ', co.name, ': ', t.title) ORDER BY t.scheduled_on SEPARATOR '; '),
                     ' — Motivo: ', p_reason), 1000),
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_STATUS' AND v.code = 'open'),
         'leave_request', v_leave_id, p_actor_user_id
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
  JOIN components co ON co.id = g.component_id
  JOIN group_enrollments ge ON ge.group_id = g.id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
  JOIN users su ON su.id = p_actor_user_id
  WHERE t.is_deleted = FALSE AND g.instructor_id IS NOT NULL
    AND (t.id = p_topic_id OR (p_topic_id IS NULL AND t.scheduled_on BETWEEN p_starts_on AND p_ends_on))
  GROUP BY g.instructor_id, su.tenant_id, su.full_name;

  SELECT v_leave_id AS leave_request_id;
END$$

CREATE PROCEDURE sp_leave_requests_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  SELECT l.id, l.student_id, su.full_name AS student_name, l.starts_on, l.ends_on, l.reason,
         lt.code AS type_code, lt.label AS type_label, l.evidence_url,
         ls.code AS status_code, ls.label AS status_label,
         l.admin_comments, l.resolved_at, l.created_at,
         l.topic_id, lt2.title AS topic_title, lt2.scheduled_on AS topic_scheduled_on, lc.name AS component_name
  FROM leave_requests l
  JOIN users su ON su.id = l.student_id
  JOIN master_catalog_values ls ON ls.id = l.status_id
  LEFT JOIN master_catalog_values lt ON lt.id = l.leave_type_id
  LEFT JOIN topics lt2 ON lt2.id = l.topic_id
  LEFT JOIN component_groups lg ON lg.id = lt2.group_id
  LEFT JOIN components lc ON lc.id = lg.component_id
  WHERE l.is_deleted = FALSE
    AND (
      (p_actor_role = 'student' AND l.student_id = p_actor_user_id)
      -- El instructor ve (sin resolver) las de sus clases: la clase
      -- indicada si es suya, o cualquier permiso de un alumno de sus grupos.
      OR (p_actor_role = 'instructor' AND (
        lg.instructor_id = p_actor_user_id
        OR (l.topic_id IS NULL AND EXISTS (
          SELECT 1 FROM group_enrollments ge JOIN component_groups g ON g.id = ge.group_id
          WHERE ge.student_id = l.student_id AND ge.is_deleted = FALSE AND g.is_deleted = FALSE AND g.instructor_id = p_actor_user_id
        ))
      ))
      OR (p_actor_role = 'tenant_admin' AND su.tenant_id = p_actor_tenant_id)
      OR (p_actor_role = 'super_admin')
    )
  ORDER BY l.created_at DESC;
END$$

CREATE PROCEDURE sp_leave_requests_resolve(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_leave_request_id BIGINT UNSIGNED, IN p_status_code VARCHAR(80), IN p_admin_comments VARCHAR(500)
)
BEGIN
  DECLARE v_student_tenant_id BIGINT UNSIGNED;
  DECLARE v_current_status_code VARCHAR(80);
  DECLARE v_status_id BIGINT UNSIGNED;

  SELECT su.tenant_id, ls.code INTO v_student_tenant_id, v_current_status_code
  FROM leave_requests l JOIN users su ON su.id = l.student_id JOIN master_catalog_values ls ON ls.id = l.status_id
  WHERE l.id = p_leave_request_id AND l.is_deleted = FALSE;

  IF v_student_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;

  IF p_status_code NOT IN ('approved', 'rejected') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;

  IF v_current_status_code <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'leave_not_pending';
  END IF;

  IF p_actor_role = 'tenant_admin' AND v_student_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'LEAVE_STATUS' AND v.code = p_status_code;

  UPDATE leave_requests
  SET status_id = v_status_id, admin_comments = p_admin_comments, resolved_at = NOW(), resolved_by = p_actor_user_id,
      updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_leave_request_id;
END$$

CREATE PROCEDURE sp_leave_requests_cancel(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_leave_request_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_owner_id BIGINT UNSIGNED;
  DECLARE v_current_status_code VARCHAR(80);
  DECLARE v_status_id BIGINT UNSIGNED;

  SELECT l.student_id, ls.code INTO v_owner_id, v_current_status_code
  FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id
  WHERE l.id = p_leave_request_id AND l.is_deleted = FALSE;

  IF v_owner_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role <> 'student' OR p_actor_user_id <> v_owner_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF v_current_status_code <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'leave_not_pending';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'LEAVE_STATUS' AND v.code = 'cancelled';

  UPDATE leave_requests SET status_id = v_status_id, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_leave_request_id;

  -- El aviso al instructor deja de valer: si no lo leyo se retira; si ya
  -- lo leyo, recibe otra alerta diciendo que el alumno si asistira.
  UPDATE alerts SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id
  WHERE source_type = 'leave_request' AND source_id = p_leave_request_id AND is_deleted = FALSE AND read_at IS NULL;
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT a.tenant_id, a.type_id,
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_PRIORITY' AND v.code = 'low'),
         a.recipient_user_id,
         LEFT(CONCAT((SELECT full_name FROM users WHERE id = v_owner_id), ' retiró su aviso: sí asistirá'), 200),
         a.description,
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_STATUS' AND v.code = 'open'),
         a.source_type, a.source_id, p_actor_user_id
  FROM alerts a
  WHERE a.source_type = 'leave_request' AND a.source_id = p_leave_request_id AND a.is_deleted = FALSE AND a.read_at IS NOT NULL;
END$$

-- Componentes propios de un instructor (para su vista "Mis clases" / temario / asistencia).
CREATE PROCEDURE sp_groups_list_by_instructor(IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'instructor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT g.id, g.name, c.id AS component_id, c.name AS component_name,
         gs.code AS status_code, gs.label AS status_label,
         p.id AS program_id, p.name AS program_name, p.cohort
  FROM component_groups g
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values gs ON gs.id = g.status_id
  WHERE g.instructor_id = p_actor_user_id AND g.is_deleted = FALSE AND c.is_deleted = FALSE AND p.is_deleted = FALSE
  ORDER BY p.name, c.sort_order, g.name;
END$$

-- ===================================================================
-- Reportes: agregaciones puras (sin cursores), acotadas por tenant. Solo
-- admins (tenant_admin de su tenant, o super_admin -- global o con
-- p_tenant_id_filter para "reportes por tenant"). Todos calculan en SQL.
-- ===================================================================
CREATE PROCEDURE sp_reports_attendance_by_program(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT p.id AS program_id, p.name AS program_name, p.tenant_id,
    COUNT(a.id) AS total_records,
    SUM(ast.code IN ('present', 'late')) AS present_count,
    SUM(ast.code = 'absent') AS absent_count,
    SUM(ast.code = 'justified_absent') AS justified_count,
    ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(a.id), 0), 1) AS attendance_rate
  FROM training_programs p
  JOIN components c ON c.program_id = p.id AND c.is_deleted = FALSE
  JOIN component_groups g ON g.component_id = c.id AND g.is_deleted = FALSE
  JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
  JOIN attendance a ON a.topic_id = t.id AND a.is_deleted = FALSE
  JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
  WHERE p.is_deleted = FALSE AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
  GROUP BY p.id, p.name, p.tenant_id
  ORDER BY p.name;
END$$

CREATE PROCEDURE sp_reports_attendance_by_component(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT c.id AS component_id, c.name AS component_name, p.id AS program_id, p.name AS program_name,
    COUNT(a.id) AS total_records,
    SUM(ast.code IN ('present', 'late')) AS present_count,
    SUM(ast.code = 'absent') AS absent_count,
    SUM(ast.code = 'justified_absent') AS justified_count,
    ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(a.id), 0), 1) AS attendance_rate
  FROM components c
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  JOIN component_groups g ON g.component_id = c.id AND g.is_deleted = FALSE
  JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
  JOIN attendance a ON a.topic_id = t.id AND a.is_deleted = FALSE
  JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
  WHERE c.is_deleted = FALSE AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
  GROUP BY c.id, c.name, p.id, p.name
  ORDER BY p.name, c.sort_order;
END$$

CREATE PROCEDURE sp_reports_attendance_by_student(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT su.id AS student_id, su.full_name AS student_name, su.tenant_id,
    COUNT(a.id) AS total_records,
    SUM(ast.code IN ('present', 'late')) AS present_count,
    SUM(ast.code = 'absent') AS absent_count,
    SUM(ast.code = 'justified_absent') AS justified_count,
    ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(a.id), 0), 1) AS attendance_rate
  FROM users su
  JOIN attendance a ON a.student_id = su.id AND a.is_deleted = FALSE
  JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
  WHERE su.is_deleted = FALSE AND (v_tenant_filter IS NULL OR su.tenant_id = v_tenant_filter)
  GROUP BY su.id, su.full_name, su.tenant_id
  ORDER BY attendance_rate ASC;
END$$

-- p_justified = TRUE -> inasistencias justificadas; FALSE -> no justificadas.
CREATE PROCEDURE sp_reports_absences(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED, IN p_justified BOOLEAN
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT a.id, su.full_name AS student_name, t.title AS topic_title, t.scheduled_on,
    p.name AS program_name, c.name AS component_name, ar.label AS reason_label, a.observations
  FROM attendance a
  JOIN users su ON su.id = a.student_id
  JOIN topics t ON t.id = a.topic_id
  JOIN component_groups g ON g.id = t.group_id
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
  LEFT JOIN master_catalog_values ar ON ar.id = a.reason_id
  WHERE a.is_deleted = FALSE
    AND ast.code = IF(p_justified, 'justified_absent', 'absent')
    AND (v_tenant_filter IS NULL OR su.tenant_id = v_tenant_filter)
  ORDER BY t.scheduled_on DESC;
END$$

CREATE PROCEDURE sp_reports_program_progress(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT p.id AS program_id, p.name AS program_name, ps.label AS status_label,
    COUNT(t.id) AS total_topics,
    SUM(ts.code = 'completed') AS completed_topics,
    SUM(ts.code NOT IN ('completed', 'cancelled') AND t.scheduled_on IS NOT NULL AND t.scheduled_on < CURDATE()) AS delayed_topics,
    ROUND(100 * SUM(ts.code = 'completed') / NULLIF(COUNT(t.id), 0), 1) AS progress_pct
  FROM training_programs p
  JOIN master_catalog_values ps ON ps.id = p.status_id
  LEFT JOIN components c ON c.program_id = p.id AND c.is_deleted = FALSE
  LEFT JOIN component_groups g ON g.component_id = c.id AND g.is_deleted = FALSE
  LEFT JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
  LEFT JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE p.is_deleted = FALSE AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
  GROUP BY p.id, p.name, ps.label
  ORDER BY p.name;
END$$

CREATE PROCEDURE sp_reports_component_progress(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT c.id AS component_id, c.name AS component_name, p.name AS program_name,
    (SELECT COUNT(*) FROM group_enrollments ge JOIN component_groups g2 ON g2.id = ge.group_id
       WHERE g2.component_id = c.id AND ge.is_deleted = FALSE AND EXISTS (SELECT 1 FROM users ux WHERE ux.id = ge.student_id AND ux.is_active = TRUE AND ux.is_deleted = FALSE)) AS enrolled_students,
    COUNT(t.id) AS total_topics,
    SUM(ts.code = 'completed') AS completed_topics,
    ROUND(100 * SUM(ts.code = 'completed') / NULLIF(COUNT(t.id), 0), 1) AS progress_pct
  FROM components c
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  LEFT JOIN component_groups g ON g.component_id = c.id AND g.is_deleted = FALSE
  LEFT JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
  LEFT JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE c.is_deleted = FALSE AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
  GROUP BY c.id, c.name, p.name
  ORDER BY p.name, c.sort_order;
END$$

CREATE PROCEDURE sp_reports_instructor_compliance(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT iu.id AS instructor_id, iu.full_name AS instructor_name,
    COUNT(t.id) AS due_topics,
    SUM(ts.code = 'completed') AS completed_topics,
    SUM(ts.code NOT IN ('completed', 'cancelled')) AS delayed_topics,
    ROUND(100 * SUM(ts.code = 'completed') / NULLIF(COUNT(t.id), 0), 1) AS compliance_pct
  FROM users iu
  JOIN component_groups g ON g.instructor_id = iu.id AND g.is_deleted = FALSE
  JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
    AND t.scheduled_on IS NOT NULL AND t.scheduled_on < CURDATE()
  JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE iu.is_deleted = FALSE AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
  GROUP BY iu.id, iu.full_name
  ORDER BY compliance_pct ASC;
END$$

CREATE PROCEDURE sp_reports_delayed_topics(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT t.id AS topic_id, t.title, t.scheduled_on, p.name AS program_name, c.name AS component_name,
    iu.full_name AS instructor_name, DATEDIFF(CURDATE(), t.scheduled_on) AS days_late
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values ts ON ts.id = t.status_id
  LEFT JOIN users iu ON iu.id = g.instructor_id
  WHERE t.is_deleted = FALSE AND t.scheduled_on IS NOT NULL AND t.scheduled_on < CURDATE()
    AND ts.code NOT IN ('completed', 'cancelled')
    AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
  ORDER BY days_late DESC;
END$$

-- "Adelantado": se completo antes de la fecha programada.
CREATE PROCEDURE sp_reports_ahead_topics(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT t.id AS topic_id, t.title, t.scheduled_on, t.actual_date, p.name AS program_name, c.name AS component_name,
    iu.full_name AS instructor_name, DATEDIFF(t.scheduled_on, t.actual_date) AS days_ahead
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  LEFT JOIN users iu ON iu.id = g.instructor_id
  WHERE t.is_deleted = FALSE AND t.actual_date IS NOT NULL AND t.scheduled_on IS NOT NULL
    AND t.actual_date < t.scheduled_on
    AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
  ORDER BY days_ahead DESC;
END$$

CREATE PROCEDURE sp_reports_leave_requests_summary(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT ls.code AS status_code, ls.label AS status_label, COUNT(*) AS total
  FROM leave_requests l
  JOIN users su ON su.id = l.student_id
  JOIN master_catalog_values ls ON ls.id = l.status_id
  WHERE l.is_deleted = FALSE AND (v_tenant_filter IS NULL OR su.tenant_id = v_tenant_filter)
  GROUP BY ls.code, ls.label
  ORDER BY total DESC;
END$$

-- Comparativo por periodo: metricas del rango elegido contra el periodo
-- inmediatamente anterior de igual duracion (calculado, no pedido aparte).
CREATE PROCEDURE sp_reports_period_comparison(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED,
  IN p_period_start DATE, IN p_period_end DATE
)
BEGIN
  DECLARE v_tenant_filter BIGINT UNSIGNED;
  DECLARE v_days INT;
  DECLARE v_prev_start DATE;
  DECLARE v_prev_end DATE;

  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_date_range';
  END IF;
  SET v_tenant_filter = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SET v_days = DATEDIFF(p_period_end, p_period_start) + 1;
  SET v_prev_end = DATE_SUB(p_period_start, INTERVAL 1 DAY);
  SET v_prev_start = DATE_SUB(v_prev_end, INTERVAL v_days - 1 DAY);

  SELECT 'current' AS period_label, p_period_start AS period_start, p_period_end AS period_end,
    (SELECT COUNT(*) FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id
       JOIN training_programs p ON p.id = c.program_id
       WHERE a.is_deleted = FALSE AND t.scheduled_on BETWEEN p_period_start AND p_period_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)) AS attendance_records,
    (SELECT ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(*), 0), 1)
       FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id
       JOIN training_programs p ON p.id = c.program_id JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
       WHERE a.is_deleted = FALSE AND t.scheduled_on BETWEEN p_period_start AND p_period_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)) AS attendance_rate,
    (SELECT COUNT(*) FROM topics t JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
       JOIN master_catalog_values ts ON ts.id = t.status_id
       WHERE t.is_deleted = FALSE AND ts.code = 'completed' AND t.actual_date BETWEEN p_period_start AND p_period_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)) AS topics_completed,
    (SELECT COUNT(*) FROM leave_requests l JOIN users su ON su.id = l.student_id
       WHERE l.is_deleted = FALSE AND l.created_at BETWEEN p_period_start AND DATE_ADD(p_period_end, INTERVAL 1 DAY)
         AND (v_tenant_filter IS NULL OR su.tenant_id = v_tenant_filter)) AS leave_requests_created

  UNION ALL

  SELECT 'previous', v_prev_start, v_prev_end,
    (SELECT COUNT(*) FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id
       JOIN training_programs p ON p.id = c.program_id
       WHERE a.is_deleted = FALSE AND t.scheduled_on BETWEEN v_prev_start AND v_prev_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)),
    (SELECT ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(*), 0), 1)
       FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id
       JOIN training_programs p ON p.id = c.program_id JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
       WHERE a.is_deleted = FALSE AND t.scheduled_on BETWEEN v_prev_start AND v_prev_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)),
    (SELECT COUNT(*) FROM topics t JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
       JOIN master_catalog_values ts ON ts.id = t.status_id
       WHERE t.is_deleted = FALSE AND ts.code = 'completed' AND t.actual_date BETWEEN v_prev_start AND v_prev_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)),
    (SELECT COUNT(*) FROM leave_requests l JOIN users su ON su.id = l.student_id
       WHERE l.is_deleted = FALSE AND l.created_at BETWEEN v_prev_start AND DATE_ADD(v_prev_end, INTERVAL 1 DAY)
         AND (v_tenant_filter IS NULL OR su.tenant_id = v_tenant_filter));
END$$

-- ===================================================================
-- Dashboards reales de alumno e instructor (agenda + metricas). Sustituyen
-- los datos de ejemplo que traia el frontend original.
-- ===================================================================
CREATE PROCEDURE sp_student_agenda(IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'student' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT t.id AS topic_id, t.title, t.scheduled_on, t.duration_minutes,
    p.name AS program_name, c.name AS component_name, iu.full_name AS instructor_name, ts.code AS status_code, ts.label AS status_label
  FROM group_enrollments ge
  JOIN component_groups g ON g.id = ge.group_id AND g.is_deleted = FALSE
  JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id
  JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
  JOIN master_catalog_values ts ON ts.id = t.status_id
  LEFT JOIN users iu ON iu.id = g.instructor_id
  WHERE ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
    AND t.scheduled_on IS NOT NULL AND t.scheduled_on >= CURDATE() AND ts.code NOT IN ('completed', 'cancelled')
  ORDER BY t.scheduled_on
  LIMIT 10;
END$$

CREATE PROCEDURE sp_student_metrics(IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'student' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT
    (SELECT ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(*), 0), 1)
       FROM attendance a JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
       WHERE a.student_id = p_actor_user_id AND a.is_deleted = FALSE) AS attendance_rate,
    (SELECT COUNT(*) FROM group_enrollments ge JOIN component_groups g ON g.id = ge.group_id AND g.is_deleted = FALSE
       JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE JOIN master_catalog_values ts ON ts.id = t.status_id
       WHERE ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE AND ts.code NOT IN ('completed', 'cancelled')) AS topics_pending,
    (SELECT ROUND(AVG(prog.progress_pct), 1) FROM (
       SELECT p.id, ROUND(100 * SUM(ts.code = 'completed') / NULLIF(COUNT(t.id), 0), 1) AS progress_pct
       FROM program_enrollments pe
       JOIN training_programs p ON p.id = pe.program_id AND p.is_deleted = FALSE
       JOIN components c ON c.program_id = p.id AND c.is_deleted = FALSE
       JOIN component_groups g ON g.component_id = c.id AND g.is_deleted = FALSE
       JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
       JOIN master_catalog_values ts ON ts.id = t.status_id
       WHERE pe.student_id = p_actor_user_id AND pe.is_deleted = FALSE
       GROUP BY p.id
     ) prog) AS program_progress_pct;
END$$

-- Todo el temario del instructor (pasado y futuro, cualquier estado), sin
-- limite de 10 ni recorte a "solo futuro" como sp_instructor_agenda:
-- alimenta su calendario semanal visual (navegable, no solo una lista).
CREATE PROCEDURE sp_topics_list_by_instructor(IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'instructor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT t.id, t.title, t.scheduled_on, t.duration_minutes, ts.code AS status_code, ts.label AS status_label,
         g.id AS group_id, g.name AS group_name,
         c.id AS component_id, c.name AS component_name,
         p.id AS program_id, p.name AS program_name,
         (SELECT COUNT(*) FROM group_enrollments ge WHERE ge.group_id = g.id AND ge.is_deleted = FALSE AND EXISTS (SELECT 1 FROM users ux WHERE ux.id = ge.student_id AND ux.is_active = TRUE AND ux.is_deleted = FALSE)) AS enrolled_students
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE g.instructor_id = p_actor_user_id AND t.is_deleted = FALSE AND g.is_deleted = FALSE AND c.is_deleted = FALSE
  ORDER BY t.scheduled_on;
END$$

CREATE PROCEDURE sp_instructor_agenda(IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'instructor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT t.id AS topic_id, t.title, t.scheduled_on, t.duration_minutes, g.id AS group_id,
    p.name AS program_name, c.name AS component_name,
    (SELECT COUNT(*) FROM group_enrollments ge WHERE ge.group_id = g.id AND ge.is_deleted = FALSE AND EXISTS (SELECT 1 FROM users ux WHERE ux.id = ge.student_id AND ux.is_active = TRUE AND ux.is_deleted = FALSE)) AS enrolled_students,
    ts.code AS status_code, ts.label AS status_label
  FROM component_groups g
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
  JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE g.instructor_id = p_actor_user_id AND g.is_deleted = FALSE
    AND t.scheduled_on IS NOT NULL AND t.scheduled_on >= CURDATE() AND ts.code NOT IN ('completed', 'cancelled')
  ORDER BY t.scheduled_on
  LIMIT 10;
END$$

CREATE PROCEDURE sp_instructor_metrics(IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'instructor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT
    (SELECT COUNT(*) FROM component_groups g JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
       WHERE g.instructor_id = p_actor_user_id AND g.is_deleted = FALSE
         AND t.scheduled_on BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)
    ) AS classes_this_week,
    (SELECT ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(*), 0), 1)
       FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN component_groups g ON g.id = t.group_id
       JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
       WHERE g.instructor_id = p_actor_user_id AND a.is_deleted = FALSE) AS group_attendance_rate,
    (SELECT COUNT(*) FROM component_groups g JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
       JOIN master_catalog_values ts ON ts.id = t.status_id
       WHERE g.instructor_id = p_actor_user_id AND g.is_deleted = FALSE
         AND t.scheduled_on IS NOT NULL AND t.scheduled_on < CURDATE() AND ts.code NOT IN ('completed', 'cancelled')
    ) AS delayed_topics;
END$$

-- ===================================================================
-- Material didactico (ZIP por componente). La API descomprime y sirve los
-- archivos; estos SPs deciden quien puede ver/gestionar y a que archivo
-- corresponde cada tema. Gestionan: admins del tenant e instructores de
-- algun grupo del componente. Ven: ademas, los alumnos inscritos. Las
-- soluciones (soluciones/) nunca se entregan al rol student.
-- ===================================================================
CREATE PROCEDURE sp_component_materials_get(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;

  SELECT p.tenant_id INTO v_program_tenant_id
  FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'component_not_found';
  END IF;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin', 'instructor', 'student') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role = 'instructor' AND NOT EXISTS (
    SELECT 1 FROM component_groups g
    WHERE g.component_id = p_component_id AND g.instructor_id = p_actor_user_id AND g.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role = 'student' AND NOT EXISTS (
    SELECT 1 FROM group_enrollments ge JOIN component_groups g ON g.id = ge.group_id
    WHERE g.component_id = p_component_id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE AND g.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT c.id AS component_id, c.name AS component_name,
         m.id AS material_id, m.folder, m.original_name, m.size_bytes, m.topic_file_count, m.solution_file_count,
         m.created_at AS uploaded_at, u.full_name AS uploaded_by_name,
         p_actor_role <> 'student' AS can_manage
  FROM components c
  LEFT JOIN component_materials m ON m.component_id = c.id AND m.is_deleted = FALSE
  LEFT JOIN users u ON u.id = m.created_by
  WHERE c.id = p_component_id;
END$$

-- Registra la version recien descomprimida y da de baja la anterior;
-- devuelve la carpeta anterior para que la API la borre del volumen.
CREATE PROCEDURE sp_component_materials_set(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED, IN p_folder VARCHAR(64), IN p_original_name VARCHAR(255),
  IN p_size_bytes BIGINT UNSIGNED, IN p_topic_file_count INT UNSIGNED, IN p_solution_file_count INT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_previous_folder VARCHAR(64);

  SELECT p.tenant_id INTO v_program_tenant_id
  FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'component_not_found';
  END IF;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin', 'instructor') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role = 'instructor' AND NOT EXISTS (
    SELECT 1 FROM component_groups g
    WHERE g.component_id = p_component_id AND g.instructor_id = p_actor_user_id AND g.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT folder INTO v_previous_folder FROM component_materials
  WHERE component_id = p_component_id AND is_deleted = FALSE
  ORDER BY id DESC LIMIT 1;

  UPDATE component_materials SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id
  WHERE component_id = p_component_id AND is_deleted = FALSE;

  INSERT INTO component_materials (component_id, folder, original_name, size_bytes, topic_file_count, solution_file_count, created_by)
  VALUES (p_component_id, p_folder, p_original_name, p_size_bytes, p_topic_file_count, p_solution_file_count, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS material_id, v_previous_folder AS previous_folder;
END$$

CREATE PROCEDURE sp_component_materials_remove(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_folder VARCHAR(64);

  SELECT p.tenant_id INTO v_program_tenant_id
  FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'component_not_found';
  END IF;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin', 'instructor') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role = 'instructor' AND NOT EXISTS (
    SELECT 1 FROM component_groups g
    WHERE g.component_id = p_component_id AND g.instructor_id = p_actor_user_id AND g.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT folder INTO v_folder FROM component_materials
  WHERE component_id = p_component_id AND is_deleted = FALSE
  ORDER BY id DESC LIMIT 1;

  IF v_folder IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material_not_found';
  END IF;

  UPDATE component_materials SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id
  WHERE component_id = p_component_id AND is_deleted = FALSE;

  SELECT v_folder AS removed_folder;
END$$

-- Material de UNA clase: el tema en la posicion N del temario de su grupo
-- (por sort_order, que no cambia al reprogramar) abre tema-NN.html del ZIP
-- del componente. Solo el instructor de ESE grupo, admins del tenant o
-- alumnos inscritos en ese grupo.
CREATE PROCEDURE sp_topic_material_get(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_topic_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_group_id BIGINT UNSIGNED;
  DECLARE v_group_instructor_id BIGINT UNSIGNED;
  DECLARE v_component_id BIGINT UNSIGNED;
  DECLARE v_sort_order INT;

  SELECT p.tenant_id, g.id, g.instructor_id, c.id, t.sort_order
    INTO v_program_tenant_id, v_group_id, v_group_instructor_id, v_component_id, v_sort_order
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin', 'instructor', 'student') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role = 'instructor' AND NOT (v_group_instructor_id <=> p_actor_user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role = 'student' AND NOT EXISTS (
    SELECT 1 FROM group_enrollments ge
    WHERE ge.group_id = v_group_id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT v_component_id AS component_id, m.folder,
         (SELECT COUNT(*) FROM topics t2
          WHERE t2.group_id = v_group_id AND t2.is_deleted = FALSE
            AND (t2.sort_order < v_sort_order OR (t2.sort_order = v_sort_order AND t2.id <= p_topic_id))) AS topic_position,
         p_actor_role <> 'student' AS can_view_solutions
  FROM (SELECT 1) AS one
  LEFT JOIN component_materials m ON m.component_id = v_component_id AND m.is_deleted = FALSE;
END$$

-- Datos para armar el prompt que genera el material con una IA: el
-- componente, su programa y el temario numerado igual que tema-NN.html.
-- Todos los grupos comparten malla; se toma el grupo con mas temas como
-- referencia. Una fila por tema (o una sola con tema NULL si no hay).
CREATE PROCEDURE sp_component_material_prompt_data(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_reference_group_id BIGINT UNSIGNED;

  SELECT p.tenant_id INTO v_program_tenant_id
  FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'component_not_found';
  END IF;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin', 'instructor') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role = 'instructor' AND NOT EXISTS (
    SELECT 1 FROM component_groups g
    WHERE g.component_id = p_component_id AND g.instructor_id = p_actor_user_id AND g.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT g.id INTO v_reference_group_id
  FROM component_groups g
  LEFT JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
  WHERE g.component_id = p_component_id AND g.is_deleted = FALSE
  GROUP BY g.id
  ORDER BY COUNT(t.id) DESC, g.id
  LIMIT 1;

  SELECT c.id AS component_id, c.name AS component_name, c.description AS component_description,
         p.name AS program_name, p.description AS program_description, p.cohort,
         pm.label AS modality_label, p.starts_on, p.ends_on,
         tn.name AS tenant_name, tn.brand_color AS tenant_brand_color, tn.logo_path AS tenant_logo_path,
         c.color_primary AS component_color_primary, c.color_accent AS component_color_accent,
         p.color_primary AS program_color_primary, p.color_accent AS program_color_accent,
         t.id AS topic_id, t.title AS topic_title, t.description AS topic_description, t.duration_minutes
  FROM components c
  JOIN training_programs p ON p.id = c.program_id
  JOIN tenants tn ON tn.id = p.tenant_id
  LEFT JOIN master_catalog_values pm ON pm.id = p.modality_id
  LEFT JOIN topics t ON t.group_id = v_reference_group_id AND t.is_deleted = FALSE
  WHERE c.id = p_component_id
  ORDER BY t.sort_order, t.id;
END$$

-- Temario de un programa para exportar a Excel y corregirlo: por cada
-- componente, el temario de su grupo de referencia (el de mas temas; todos
-- comparten malla) con la posicion de cada tema, que es la clave con la
-- que se vuelve a cargar.
CREATE PROCEDURE sp_program_temario_export(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_program_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT c.id AS component_id, c.name AS component_name,
         (SELECT COUNT(*) FROM topics t2
          WHERE t2.group_id = t.group_id AND t2.is_deleted = FALSE
            AND (t2.sort_order < t.sort_order OR (t2.sort_order = t.sort_order AND t2.id <= t.id))) AS topic_position,
         t.title, t.description
  FROM components c
  JOIN topics t ON t.is_deleted = FALSE AND t.group_id = (
    SELECT g.id FROM component_groups g
    LEFT JOIN topics tt ON tt.group_id = g.id AND tt.is_deleted = FALSE
    WHERE g.component_id = c.id AND g.is_deleted = FALSE
    GROUP BY g.id
    ORDER BY COUNT(tt.id) DESC, g.id
    LIMIT 1
  )
  WHERE c.program_id = p_program_id AND c.is_deleted = FALSE
  ORDER BY c.sort_order, c.name, topic_position;
END$$

-- Corrige el titulo/alcance del tema N de un componente en TODOS sus
-- grupos (comparten malla). No toca fechas ni estado: eso lo maneja el
-- horario. Devuelve cuantos temas cambiaron (0 si ya estaba igual).
CREATE PROCEDURE sp_topics_update_by_position(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_component_id BIGINT UNSIGNED, IN p_position INT UNSIGNED,
  IN p_title VARCHAR(180), IN p_description TEXT
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_targets INT;

  SELECT p.tenant_id INTO v_program_tenant_id
  FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.program_id = p_program_id AND c.is_deleted = FALSE AND p.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'component_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_title IS NULL OR TRIM(p_title) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'title_required';
  END IF;

  -- Los ids van primero a una tabla temporal: MySQL no deja leer topics
  -- en una subconsulta del mismo UPDATE que la modifica.
  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_topic_targets (id BIGINT UNSIGNED PRIMARY KEY);
  TRUNCATE TABLE tmp_topic_targets;
  INSERT INTO tmp_topic_targets (id)
  SELECT DISTINCT t1.id
  FROM topics t1
  JOIN component_groups g ON g.id = t1.group_id AND g.component_id = p_component_id AND g.is_deleted = FALSE
  WHERE t1.is_deleted = FALSE
    AND (SELECT COUNT(*) FROM topics t2
         WHERE t2.group_id = t1.group_id AND t2.is_deleted = FALSE
           AND (t2.sort_order < t1.sort_order OR (t2.sort_order = t1.sort_order AND t2.id <= t1.id))) = p_position;

  SELECT COUNT(*) INTO v_targets FROM tmp_topic_targets;
  IF v_targets = 0 THEN
    DROP TEMPORARY TABLE tmp_topic_targets;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;

  UPDATE topics t JOIN tmp_topic_targets x ON x.id = t.id
  SET t.title = TRIM(p_title), t.description = NULLIF(TRIM(p_description), ''), t.updated_at = NOW(), t.updated_by = p_actor_user_id
  WHERE NOT (t.title <=> TRIM(p_title)) OR NOT (t.description <=> NULLIF(TRIM(p_description), ''));

  SELECT ROW_COUNT() AS updated_topics, v_targets AS matched_topics;
  DROP TEMPORARY TABLE tmp_topic_targets;
END$$

-- Todo el temario del alumno (pasado y futuro), para "Mis temas": desde
-- ahi abre el material de cada clase.
CREATE PROCEDURE sp_topics_list_by_student(IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'student' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT t.id, t.title, t.description, t.sort_order, t.scheduled_on, ts.code AS status_code, ts.label AS status_label,
         g.id AS group_id, g.name AS group_name, c.id AS component_id, c.name AS component_name,
         p.id AS program_id, p.name AS program_name, iu.full_name AS instructor_name,
         EXISTS (SELECT 1 FROM component_materials m WHERE m.component_id = c.id AND m.is_deleted = FALSE) AS has_material
  FROM group_enrollments ge
  JOIN component_groups g ON g.id = ge.group_id AND g.is_deleted = FALSE
  JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
  JOIN master_catalog_values ts ON ts.id = t.status_id
  LEFT JOIN users iu ON iu.id = g.instructor_id
  WHERE ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
  ORDER BY p.name, c.sort_order, c.name, t.sort_order, t.id;
END$$

-- ===================================================================
-- Web publica por programa y preinscripciones. Lo publico (sin sesion)
-- solo ve programas marcados is_public de tenants activos; la gestion es
-- de super_admin o tenant_admin de su tenant.
-- ===================================================================
CREATE PROCEDURE sp_public_program_get(IN p_tenant_slug VARCHAR(80), IN p_program_slug VARCHAR(100))
BEGIN
  DECLARE v_program_id BIGINT UNSIGNED;

  SELECT p.id INTO v_program_id
  FROM training_programs p
  JOIN tenants tn ON tn.id = p.tenant_id
  JOIN master_catalog_values ts ON ts.id = tn.status_id
  WHERE tn.slug = p_tenant_slug AND p.public_slug = p_program_slug AND p.is_public = TRUE
    AND p.is_deleted = FALSE AND tn.is_deleted = FALSE AND ts.code = 'active';

  IF v_program_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;

  SELECT p.id AS program_id, p.name, p.description, p.cohort, p.starts_on, p.ends_on, pm.label AS modality_label,
         p.public_tagline, p.public_audience, p.banner_path, p.enrollment_open,
         p.color_primary, p.color_accent,
         tn.name AS tenant_name, tn.slug AS tenant_slug, tn.logo_path, tn.brand_color
  FROM training_programs p
  JOIN tenants tn ON tn.id = p.tenant_id
  LEFT JOIN master_catalog_values pm ON pm.id = p.modality_id
  WHERE p.id = v_program_id;
END$$

-- Temario publico: por componente, el de su grupo de referencia.
CREATE PROCEDURE sp_public_program_temario(IN p_program_id BIGINT UNSIGNED)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM training_programs WHERE id = p_program_id AND is_public = TRUE AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;

  SELECT c.id AS component_id, c.name AS component_name, c.description AS component_description,
         (SELECT COUNT(*) FROM topics t2
          WHERE t2.group_id = t.group_id AND t2.is_deleted = FALSE
            AND (t2.sort_order < t.sort_order OR (t2.sort_order = t.sort_order AND t2.id <= t.id))) AS topic_position,
         t.title, t.duration_minutes
  FROM components c
  LEFT JOIN topics t ON t.is_deleted = FALSE AND t.group_id = (
    SELECT g.id FROM component_groups g
    LEFT JOIN topics tt ON tt.group_id = g.id AND tt.is_deleted = FALSE
    WHERE g.component_id = c.id AND g.is_deleted = FALSE
    GROUP BY g.id
    ORDER BY COUNT(tt.id) DESC, g.id
    LIMIT 1
  )
  WHERE c.program_id = p_program_id AND c.is_deleted = FALSE
  ORDER BY c.sort_order, c.name, topic_position;
END$$

CREATE PROCEDURE sp_public_program_instructors(IN p_program_id BIGINT UNSIGNED)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM training_programs WHERE id = p_program_id AND is_public = TRUE AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;

  SELECT u.id, u.full_name, u.public_headline, u.public_bio, u.photo_path, u.linkedin_url,
         GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS components
  FROM component_groups g
  JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  JOIN users u ON u.id = g.instructor_id AND u.is_deleted = FALSE AND u.is_active = TRUE
  WHERE c.program_id = p_program_id AND g.is_deleted = FALSE
  GROUP BY u.id, u.full_name, u.public_headline, u.public_bio, u.photo_path, u.linkedin_url
  ORDER BY u.full_name;
END$$

CREATE PROCEDURE sp_public_program_schedule(IN p_program_id BIGINT UNSIGNED)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM training_programs WHERE id = p_program_id AND is_public = TRUE AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;

  SELECT sd.weekday, TIME_FORMAT(sd.start_time, '%H:%i') AS start_time, TIME_FORMAT(sd.end_time, '%H:%i') AS end_time
  FROM component_group_schedule_days sd
  JOIN component_groups g ON g.id = sd.group_id AND g.is_deleted = FALSE
  JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  WHERE c.program_id = p_program_id AND sd.is_deleted = FALSE
  GROUP BY sd.weekday, sd.start_time, sd.end_time
  ORDER BY sd.weekday, sd.start_time;
END$$

CREATE PROCEDURE sp_programs_update_public(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_public_slug VARCHAR(100), IN p_is_public BOOLEAN, IN p_enrollment_open BOOLEAN,
  IN p_tagline VARCHAR(255), IN p_audience TEXT
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF p_public_slug IS NOT NULL AND p_public_slug NOT REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_slug';
  END IF;
  IF p_is_public AND p_public_slug IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'slug_required';
  END IF;
  IF p_public_slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM training_programs
    WHERE tenant_id = v_program_tenant_id AND public_slug = p_public_slug AND id <> p_program_id AND is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'slug_already_exists';
  END IF;

  UPDATE training_programs
  SET public_slug = p_public_slug, is_public = p_is_public, enrollment_open = p_enrollment_open,
      public_tagline = NULLIF(TRIM(p_tagline), ''), public_audience = NULLIF(TRIM(p_audience), ''),
      updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_program_id;
END$$

-- Devuelve el banner anterior para que la API borre el archivo.
CREATE PROCEDURE sp_programs_set_banner(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_banner_path VARCHAR(255)
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_previous VARCHAR(255);
  SELECT tenant_id, banner_path INTO v_program_tenant_id, v_previous FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  UPDATE training_programs SET banner_path = p_banner_path, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_program_id;
  SELECT v_previous AS previous_banner_path;
END$$

-- Perfil publico de un instructor (lo edita solo el admin de su tenant).
CREATE PROCEDURE sp_users_update_public_profile(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_user_id BIGINT UNSIGNED, IN p_headline VARCHAR(160), IN p_bio TEXT, IN p_linkedin_url VARCHAR(255)
)
BEGIN
  DECLARE v_user_tenant_id BIGINT UNSIGNED;
  DECLARE v_user_role VARCHAR(80);
  SELECT u.tenant_id, v.code INTO v_user_tenant_id, v_user_role
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id WHERE u.id = p_user_id AND u.is_deleted = FALSE;

  IF v_user_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF v_user_role <> 'instructor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_invalid';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_user_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  UPDATE users
  SET public_headline = NULLIF(TRIM(p_headline), ''), public_bio = NULLIF(TRIM(p_bio), ''),
      linkedin_url = NULLIF(TRIM(p_linkedin_url), ''), updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_user_id;
END$$

CREATE PROCEDURE sp_users_set_photo(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_user_id BIGINT UNSIGNED, IN p_photo_path VARCHAR(255)
)
BEGIN
  DECLARE v_user_tenant_id BIGINT UNSIGNED;
  DECLARE v_user_role VARCHAR(80);
  DECLARE v_previous VARCHAR(255);
  SELECT u.tenant_id, v.code, u.photo_path INTO v_user_tenant_id, v_user_role, v_previous
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id WHERE u.id = p_user_id AND u.is_deleted = FALSE;

  IF v_user_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF v_user_role <> 'instructor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_invalid';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_user_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  UPDATE users SET photo_path = p_photo_path, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_user_id;
  SELECT v_previous AS previous_photo_path;
END$$

-- Formulario publico. Duplicado = misma persona (email o documento) con
-- una preinscripcion pendiente o confirmada en el mismo programa. Freno
-- basico de abuso: maximo 20 envios por IP por hora.
CREATE PROCEDURE sp_pre_enrollments_create(
  IN p_tenant_slug VARCHAR(80), IN p_program_slug VARCHAR(100),
  IN p_full_name VARCHAR(160), IN p_email VARCHAR(190), IN p_phone VARCHAR(40), IN p_corporate_email VARCHAR(190),
  IN p_document_type_code VARCHAR(80), IN p_document_number VARCHAR(40), IN p_country VARCHAR(80), IN p_ip_address VARCHAR(64)
)
BEGIN
  DECLARE v_program_id BIGINT UNSIGNED;
  DECLARE v_enrollment_open BOOLEAN;
  DECLARE v_document_type_id BIGINT UNSIGNED;
  DECLARE v_pending_id BIGINT UNSIGNED;

  SELECT p.id, p.enrollment_open INTO v_program_id, v_enrollment_open
  FROM training_programs p
  JOIN tenants tn ON tn.id = p.tenant_id
  JOIN master_catalog_values ts ON ts.id = tn.status_id
  WHERE tn.slug = p_tenant_slug AND p.public_slug = p_program_slug AND p.is_public = TRUE
    AND p.is_deleted = FALSE AND tn.is_deleted = FALSE AND ts.code = 'active';

  IF v_program_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF NOT v_enrollment_open THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'enrollment_closed';
  END IF;

  SELECT v.id INTO v_document_type_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'DOCUMENT_TYPE' AND v.code = p_document_type_code;
  IF v_document_type_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_document_type';
  END IF;

  IF p_ip_address IS NOT NULL AND (
    SELECT COUNT(*) FROM pre_enrollments WHERE ip_address = p_ip_address AND created_at > NOW() - INTERVAL 1 HOUR
  ) >= 20 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'too_many_requests';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pre_enrollments pe JOIN master_catalog_values st ON st.id = pe.status_id
    WHERE pe.program_id = v_program_id AND pe.is_deleted = FALSE AND st.code IN ('pending', 'confirmed')
      AND (pe.email = p_email OR (pe.document_type_id = v_document_type_id AND pe.document_number = p_document_number))
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'already_preenrolled';
  END IF;

  SELECT v.id INTO v_pending_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'PRE_ENROLLMENT_STATUS' AND v.code = 'pending';

  INSERT INTO pre_enrollments (program_id, full_name, email, phone, corporate_email, document_type_id, document_number, country, status_id, ip_address)
  VALUES (v_program_id, p_full_name, p_email, p_phone, NULLIF(p_corporate_email, ''), v_document_type_id, p_document_number, p_country, v_pending_id, p_ip_address);

  SELECT LAST_INSERT_ID() AS pre_enrollment_id;
END$$

CREATE PROCEDURE sp_pre_enrollments_list(
  IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_id_filter BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_status_code VARCHAR(80)
)
BEGIN
  DECLARE v_scope_tenant_id BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_scope_tenant_id = IF(p_actor_role = 'super_admin', p_tenant_id_filter, p_actor_tenant_id);

  SELECT pe.id, pe.program_id, p.name AS program_name, p.cohort, pe.full_name, pe.email, pe.phone, pe.corporate_email,
         dt.code AS document_type_code, dt.label AS document_type_label, pe.document_number, pe.country,
         st.code AS status_code, st.label AS status_label, pe.student_id, pe.admin_comments,
         pe.created_at, pe.resolved_at, ru.full_name AS resolved_by_name,
         EXISTS (SELECT 1 FROM users u WHERE u.email = pe.email AND u.is_deleted = FALSE) AS email_has_account
  FROM pre_enrollments pe
  JOIN training_programs p ON p.id = pe.program_id
  JOIN master_catalog_values dt ON dt.id = pe.document_type_id
  JOIN master_catalog_values st ON st.id = pe.status_id
  LEFT JOIN users ru ON ru.id = pe.resolved_by
  WHERE pe.is_deleted = FALSE AND p.is_deleted = FALSE
    AND (v_scope_tenant_id IS NULL OR p.tenant_id = v_scope_tenant_id)
    AND (p_program_id IS NULL OR pe.program_id = p_program_id)
    AND (p_status_code IS NULL OR st.code = p_status_code)
  ORDER BY pe.created_at DESC;
END$$

-- Confirmar = crear la cuenta del alumno (o reutilizar la suya si ya es
-- alumno de este tenant) e inscribirlo en el programa, todo o nada.
-- p_password_hash es la contrasena temporal que la API genera y muestra
-- al admin solo si la cuenta se creo ahora (account_created).
CREATE PROCEDURE sp_pre_enrollments_resolve(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_pre_enrollment_id BIGINT UNSIGNED, IN p_action VARCHAR(20), IN p_password_hash VARCHAR(255), IN p_comments VARCHAR(500)
)
BEGIN
  DECLARE v_program_id BIGINT UNSIGNED;
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_status_code VARCHAR(80);
  DECLARE v_email VARCHAR(190);
  DECLARE v_corporate_email VARCHAR(190);
  DECLARE v_full_name VARCHAR(160);
  DECLARE v_user_id BIGINT UNSIGNED;
  DECLARE v_user_tenant_id BIGINT UNSIGNED;
  DECLARE v_user_role VARCHAR(80);
  DECLARE v_tenant_status_code VARCHAR(80);
  DECLARE v_account_created BOOLEAN DEFAULT FALSE;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT pe.program_id, p.tenant_id, st.code, pe.email, NULLIF(TRIM(pe.corporate_email), ''), pe.full_name
    INTO v_program_id, v_tenant_id, v_status_code, v_email, v_corporate_email, v_full_name
  FROM pre_enrollments pe
  JOIN training_programs p ON p.id = pe.program_id
  JOIN master_catalog_values st ON st.id = pe.status_id
  WHERE pe.id = p_pre_enrollment_id AND pe.is_deleted = FALSE;

  IF v_program_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF v_status_code <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'pre_enrollment_not_pending';
  END IF;
  IF p_action NOT IN ('confirm', 'reject') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;

  START TRANSACTION;

  IF p_action = 'confirm' THEN
    SELECT ts.code INTO v_tenant_status_code
    FROM tenants t JOIN master_catalog_values ts ON ts.id = t.status_id WHERE t.id = v_tenant_id;
    IF v_tenant_status_code <> 'active' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_inactive';
    END IF;

    -- La persona puede tener ya cuenta con su correo corporativo o el personal:
    -- se usa esa (primero la corporativa) en vez de crear un duplicado.
    SELECT u.id, u.tenant_id, v.code INTO v_user_id, v_user_tenant_id, v_user_role
    FROM users u JOIN master_catalog_values v ON v.id = u.role_id
    WHERE u.is_deleted = FALSE AND (u.email = v_email OR (v_corporate_email IS NOT NULL AND u.email = v_corporate_email))
    ORDER BY (u.email <=> v_corporate_email) DESC, u.is_active DESC, u.id
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      -- El email ya es de otra persona/rol o de otro tenant: no se mezcla.
      IF v_user_role <> 'student' OR NOT (v_user_tenant_id <=> v_tenant_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'email_already_exists';
      END IF;
    ELSE
      IF p_password_hash IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
      END IF;
      INSERT INTO users (tenant_id, full_name, email, password_hash, role_id, is_active, must_change_password, created_by)
      VALUES (v_tenant_id, v_full_name, v_email, p_password_hash,
              (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ROLE' AND v.code = 'student'),
              TRUE, TRUE, p_actor_user_id);
      SET v_user_id = LAST_INSERT_ID();
      SET v_account_created = TRUE;
    END IF;

    INSERT INTO program_enrollments (program_id, student_id, created_by)
    VALUES (v_program_id, v_user_id, p_actor_user_id)
    ON DUPLICATE KEY UPDATE is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL;

    -- Y a un grupo de cada componente (el de menos inscritos), para que
    -- aparezca en el temario y en la asistencia. Si ya esta en un grupo de
    -- ese componente, se respeta.
    INSERT INTO group_enrollments (group_id, student_id, created_by)
    SELECT x.group_id, v_user_id, p_actor_user_id FROM (
      SELECT g.id AS group_id, ROW_NUMBER() OVER (PARTITION BY g.component_id
               ORDER BY (SELECT COUNT(*) FROM group_enrollments e WHERE e.group_id = g.id AND e.is_deleted = FALSE), g.id) AS rn
      FROM component_groups g JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
      WHERE c.program_id = v_program_id AND g.is_deleted = FALSE
        AND NOT EXISTS (SELECT 1 FROM group_enrollments ge JOIN component_groups g2 ON g2.id = ge.group_id
                        WHERE g2.component_id = g.component_id AND ge.student_id = v_user_id AND ge.is_deleted = FALSE)
    ) x WHERE x.rn = 1
    ON DUPLICATE KEY UPDATE is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL;
  END IF;

  UPDATE pre_enrollments
  SET status_id = (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
                   WHERE c.code = 'PRE_ENROLLMENT_STATUS' AND v.code = IF(p_action = 'confirm', 'confirmed', 'rejected')),
      student_id = v_user_id, admin_comments = NULLIF(TRIM(p_comments), ''),
      resolved_at = NOW(), resolved_by = p_actor_user_id
  WHERE id = p_pre_enrollment_id;

  COMMIT;

  SELECT v_user_id AS student_id, v_account_created AS account_created,
         COALESCE((SELECT email FROM users WHERE id = v_user_id), v_email) AS email, v_full_name AS full_name;
END$$

-- ===================================================================
-- Invitaciones: el usuario crea su propia contrasena con un enlace de un
-- solo uso. Quien puede invitar = quien podia resetear la contrasena:
-- super_admin a cualquiera; tenant_admin a instructores/alumnos de su
-- tenant. Un enlace nuevo anula los anteriores sin usar.
-- ===================================================================
CREATE PROCEDURE sp_user_invitations_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_user_id BIGINT UNSIGNED, IN p_token_hash CHAR(64), IN p_valid_days INT
)
BEGIN
  DECLARE v_target_tenant_id BIGINT UNSIGNED;
  DECLARE v_target_role VARCHAR(80);
  DECLARE v_expires_at DATETIME;

  SELECT u.tenant_id, v.code INTO v_target_tenant_id, v_target_role
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id
  WHERE u.id = p_user_id AND u.is_deleted = FALSE;

  IF v_target_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF NOT (
    p_actor_role = 'super_admin'
    OR (p_actor_role = 'tenant_admin' AND v_target_role IN ('instructor', 'student')
        AND v_target_tenant_id IS NOT NULL AND v_target_tenant_id = p_actor_tenant_id)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  UPDATE user_invitations SET revoked_at = NOW()
  WHERE user_id = p_user_id AND used_at IS NULL AND revoked_at IS NULL;

  SET v_expires_at = NOW() + INTERVAL GREATEST(1, COALESCE(p_valid_days, 7)) DAY;
  INSERT INTO user_invitations (user_id, token_hash, expires_at, created_by)
  VALUES (p_user_id, p_token_hash, v_expires_at, p_actor_user_id);

  SELECT v_expires_at AS expires_at;
END$$

-- Datos para la pagina publica de la invitacion (quien es, de que tenant).
CREATE PROCEDURE sp_user_invitations_get(IN p_token_hash CHAR(64))
BEGIN
  DECLARE v_invitation_id BIGINT UNSIGNED;
  DECLARE v_used_at DATETIME;
  DECLARE v_revoked_at DATETIME;
  DECLARE v_expires_at DATETIME;
  DECLARE v_user_ok BOOLEAN;

  SELECT i.id, i.used_at, i.revoked_at, i.expires_at, (u.is_active AND NOT u.is_deleted)
    INTO v_invitation_id, v_used_at, v_revoked_at, v_expires_at, v_user_ok
  FROM user_invitations i JOIN users u ON u.id = i.user_id
  WHERE i.token_hash = p_token_hash;

  IF v_invitation_id IS NULL OR v_revoked_at IS NOT NULL OR NOT v_user_ok THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invitation_invalid';
  ELSEIF v_used_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invitation_used';
  ELSEIF v_expires_at <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invitation_expired';
  END IF;

  SELECT u.full_name, u.email, r.code AS role_code, r.label AS role_label, i.expires_at,
         u.password_hash <> '' AS has_password,
         t.name AS tenant_name, t.slug AS tenant_slug, t.logo_path AS tenant_logo_path, t.brand_color AS tenant_brand_color
  FROM user_invitations i
  JOIN users u ON u.id = i.user_id
  JOIN master_catalog_values r ON r.id = u.role_id
  LEFT JOIN tenants t ON t.id = u.tenant_id
  WHERE i.id = v_invitation_id;
END$$

-- La persona fija su contrasena: queda activa para entrar y el enlace se
-- consume (y se anulan otros abiertos).
CREATE PROCEDURE sp_user_invitations_accept(IN p_token_hash CHAR(64), IN p_password_hash VARCHAR(255))
BEGIN
  DECLARE v_invitation_id BIGINT UNSIGNED;
  DECLARE v_user_id BIGINT UNSIGNED;
  DECLARE v_used_at DATETIME;
  DECLARE v_revoked_at DATETIME;
  DECLARE v_expires_at DATETIME;
  DECLARE v_user_ok BOOLEAN;

  SELECT i.id, i.user_id, i.used_at, i.revoked_at, i.expires_at, (u.is_active AND NOT u.is_deleted)
    INTO v_invitation_id, v_user_id, v_used_at, v_revoked_at, v_expires_at, v_user_ok
  FROM user_invitations i JOIN users u ON u.id = i.user_id
  WHERE i.token_hash = p_token_hash;

  IF v_invitation_id IS NULL OR v_revoked_at IS NOT NULL OR NOT v_user_ok THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invitation_invalid';
  ELSEIF v_used_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invitation_used';
  ELSEIF v_expires_at <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invitation_expired';
  END IF;

  UPDATE users
  SET password_hash = p_password_hash, must_change_password = FALSE,
      failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
  WHERE id = v_user_id;

  UPDATE user_invitations SET used_at = NOW() WHERE id = v_invitation_id;
  UPDATE user_invitations SET revoked_at = NOW()
  WHERE user_id = v_user_id AND id <> v_invitation_id AND used_at IS NULL AND revoked_at IS NULL;

  SELECT u.email FROM users u WHERE u.id = v_user_id;
END$$

-- ===================================================================
-- Paleta de colores (principal + acento). NULL en ambos = hereda:
-- componente -> programa -> marca del tenant.
-- ===================================================================
CREATE PROCEDURE sp_programs_set_colors(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_color_primary VARCHAR(7), IN p_color_accent VARCHAR(7)
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF (p_color_primary IS NOT NULL AND p_color_primary NOT REGEXP '^#[0-9a-fA-F]{6}$')
     OR (p_color_accent IS NOT NULL AND p_color_accent NOT REGEXP '^#[0-9a-fA-F]{6}$') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_color_format';
  END IF;

  UPDATE training_programs
  SET color_primary = p_color_primary, color_accent = p_color_accent, updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_program_id;
END$$

CREATE PROCEDURE sp_components_set_colors(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED, IN p_color_primary VARCHAR(7), IN p_color_accent VARCHAR(7)
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  SELECT p.tenant_id INTO v_program_tenant_id
  FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'component_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF (p_color_primary IS NOT NULL AND p_color_primary NOT REGEXP '^#[0-9a-fA-F]{6}$')
     OR (p_color_accent IS NOT NULL AND p_color_accent NOT REGEXP '^#[0-9a-fA-F]{6}$') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_color_format';
  END IF;

  UPDATE components
  SET color_primary = p_color_primary, color_accent = p_color_accent, updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_component_id;
END$$

-- Tablero de avance: una fila por tema con su componente, grupo,
-- instructor, material y hora de clase ya resueltos. El alcance lo decide
-- el rol: admins ven un programa entero (de su tenant, salvo super_admin);
-- el instructor solo sus grupos y el alumno solo los grupos donde esta
-- inscrito (p_program_id opcional para ambos). La API arma las columnas.
CREATE PROCEDURE sp_progress_board(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;

  IF p_actor_role NOT IN ('super_admin', 'tenant_admin', 'instructor', 'student') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_actor_role IN ('super_admin', 'tenant_admin') THEN
    SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
    IF v_program_tenant_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
    END IF;
    IF p_actor_role = 'tenant_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
    END IF;
  END IF;

  SELECT p.id AS program_id, p.name AS program_name, p.cohort, p.color_primary AS program_color_primary,
         p.color_accent AS program_color_accent, tn.brand_color AS tenant_brand_color, tn.timezone,
         c.id AS component_id, c.name AS component_name, c.sort_order AS component_sort_order,
         c.color_primary, c.color_accent, cs.code AS component_status_code,
         g.id AS group_id, g.name AS group_name, iu.full_name AS instructor_name,
         (SELECT COUNT(*) FROM group_enrollments ge WHERE ge.group_id = g.id AND ge.is_deleted = FALSE AND EXISTS (SELECT 1 FROM users ux WHERE ux.id = ge.student_id AND ux.is_active = TRUE AND ux.is_deleted = FALSE)) AS enrolled_students,
         m.topic_file_count AS material_topic_file_count,
         t.id AS topic_id, t.title, t.description, t.sort_order, t.scheduled_on, t.actual_date, t.duration_minutes,
         COALESCE(NULLIF(t.meeting_url, ''), g.meeting_url) AS meeting_url, t.meeting_url AS topic_meeting_url,
         g.meeting_url AS group_meeting_url, t.recording_url, t.class_notes,
         (SELECT COUNT(*) FROM topic_resources tr WHERE tr.topic_id = t.id AND tr.is_deleted = FALSE) AS resource_count,
         ts.code AS status_code, ts.label AS status_label,
         sd.start_time, sd.end_time,
         -- Asistencia de la sesion: conteos del grupo para admins/instructor;
         -- el alumno solo recibe su propio registro.
         IF(p_actor_role = 'student', NULL,
            (SELECT COUNT(*) FROM attendance a WHERE a.topic_id = t.id AND a.is_deleted = FALSE)) AS attendance_recorded,
         IF(p_actor_role = 'student', NULL,
            (SELECT COUNT(*) FROM attendance a JOIN master_catalog_values av ON av.id = a.attendance_status_id
             WHERE a.topic_id = t.id AND a.is_deleted = FALSE AND av.code IN ('present', 'late'))) AS attendance_present,
         IF(p_actor_role = 'student',
            (SELECT av.code FROM attendance a JOIN master_catalog_values av ON av.id = a.attendance_status_id
             WHERE a.topic_id = t.id AND a.student_id = p_actor_user_id AND a.is_deleted = FALSE), NULL) AS my_attendance_code,
         IF(p_actor_role = 'student',
            (SELECT av.label FROM attendance a JOIN master_catalog_values av ON av.id = a.attendance_status_id
             WHERE a.topic_id = t.id AND a.student_id = p_actor_user_id AND a.is_deleted = FALSE), NULL) AS my_attendance_label,
         -- Avisos de inasistencia vigentes (pendientes o aprobados) que
         -- cubren la clase: el del propio alumno, o cuantos tiene el grupo.
         IF(p_actor_role = 'student',
            (SELECT CONCAT(ls.code, ':', l.id) FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id
             WHERE l.student_id = p_actor_user_id AND l.is_deleted = FALSE AND ls.code IN ('pending', 'approved')
               AND (l.topic_id = t.id OR (l.topic_id IS NULL AND t.scheduled_on BETWEEN l.starts_on AND l.ends_on))
             ORDER BY ls.code = 'approved' DESC, l.created_at DESC LIMIT 1), NULL) AS my_leave,
         IF(p_actor_role = 'student', NULL,
            (SELECT COUNT(DISTINCT l.student_id) FROM leave_requests l
             JOIN master_catalog_values ls ON ls.id = l.status_id
             JOIN group_enrollments ge2 ON ge2.student_id = l.student_id AND ge2.group_id = g.id AND ge2.is_deleted = FALSE
             WHERE l.is_deleted = FALSE AND ls.code IN ('pending', 'approved')
               AND (l.topic_id = t.id OR (l.topic_id IS NULL AND t.scheduled_on BETWEEN l.starts_on AND l.ends_on)))) AS leave_count
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
  JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  JOIN tenants tn ON tn.id = p.tenant_id
  JOIN master_catalog_values cs ON cs.id = c.status_id
  JOIN master_catalog_values ts ON ts.id = t.status_id
  LEFT JOIN users iu ON iu.id = g.instructor_id
  LEFT JOIN component_materials m ON m.component_id = c.id AND m.is_deleted = FALSE
  LEFT JOIN component_group_schedule_days sd
    ON sd.group_id = g.id AND sd.is_deleted = FALSE AND sd.weekday = DAYOFWEEK(t.scheduled_on) - 1
  WHERE t.is_deleted = FALSE
    AND (p_program_id IS NULL OR p.id = p_program_id)
    AND (
      p_actor_role IN ('super_admin', 'tenant_admin')
      OR (p_actor_role = 'instructor' AND g.instructor_id = p_actor_user_id)
      OR (p_actor_role = 'student' AND EXISTS (
        SELECT 1 FROM group_enrollments ge
        WHERE ge.group_id = g.id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
      ))
    )
  ORDER BY p.name, c.sort_order, c.name, g.name, t.sort_order, t.id;
END$$

-- Asistencia de un grupo por alumno y sesion (grilla del tablero de
-- avance). Admins del tenant e instructor del grupo ven a todos los
-- inscritos; el alumno inscrito solo su propia fila.
CREATE PROCEDURE sp_progress_group_attendance(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_instructor_id BIGINT UNSIGNED;

  SELECT p.tenant_id, g.instructor_id INTO v_program_tenant_id, v_instructor_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;
  IF p_actor_role NOT IN ('super_admin', 'tenant_admin', 'instructor', 'student') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role = 'instructor' AND (v_instructor_id IS NULL OR v_instructor_id <> p_actor_user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role = 'student' AND NOT EXISTS (
    SELECT 1 FROM group_enrollments ge WHERE ge.group_id = p_group_id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT su.id AS student_id, su.full_name AS student_name, su.is_active AS student_is_active,
         a.topic_id, av.code AS status_code, av.label AS status_label
  FROM group_enrollments ge
  JOIN users su ON su.id = ge.student_id AND su.is_active = TRUE AND su.is_deleted = FALSE
  LEFT JOIN (
    SELECT a.topic_id, a.student_id, a.attendance_status_id
    FROM attendance a JOIN topics t ON t.id = a.topic_id
    WHERE t.group_id = p_group_id AND t.is_deleted = FALSE AND a.is_deleted = FALSE
  ) a ON a.student_id = ge.student_id
  LEFT JOIN master_catalog_values av ON av.id = a.attendance_status_id
  WHERE ge.group_id = p_group_id AND ge.is_deleted = FALSE
    AND (p_actor_role <> 'student' OR ge.student_id = p_actor_user_id)
  ORDER BY su.full_name, a.topic_id;
END$$

-- ===================================================================
-- Perfil propio (hoy solo el alumno lo edita; el perfil publico del
-- instructor lo sigue editando el admin).
CREATE PROCEDURE sp_profile_get_mine(IN p_actor_user_id BIGINT UNSIGNED)
BEGIN
  SELECT u.id, u.full_name, u.email, r.code AS role_code, u.public_headline AS headline, u.public_bio AS bio,
         u.photo_path, u.linkedin_url, u.github_url, u.portfolio_url, u.contact_email, u.phone, u.city, t.name AS tenant_name
  FROM users u JOIN master_catalog_values r ON r.id = u.role_id
  LEFT JOIN tenants t ON t.id = u.tenant_id
  WHERE u.id = p_actor_user_id AND u.is_deleted = FALSE;
END$$

CREATE PROCEDURE sp_profile_update_mine(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80),
  IN p_headline VARCHAR(160), IN p_bio VARCHAR(500), IN p_linkedin_url VARCHAR(255), IN p_github_url VARCHAR(255),
  IN p_portfolio_url VARCHAR(255), IN p_contact_email VARCHAR(190), IN p_phone VARCHAR(40), IN p_city VARCHAR(120)
)
BEGIN
  IF p_actor_role <> 'student' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  UPDATE users
  SET public_headline = NULLIF(TRIM(p_headline), ''), public_bio = NULLIF(TRIM(p_bio), ''),
      linkedin_url = NULLIF(TRIM(p_linkedin_url), ''), github_url = NULLIF(TRIM(p_github_url), ''),
      portfolio_url = NULLIF(TRIM(p_portfolio_url), ''), contact_email = NULLIF(TRIM(p_contact_email), ''),
      phone = NULLIF(TRIM(p_phone), ''), city = NULLIF(TRIM(p_city), ''),
      updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_actor_user_id AND is_deleted = FALSE;
END$$

CREATE PROCEDURE sp_profile_set_my_photo(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_photo_path VARCHAR(255)
)
BEGIN
  DECLARE v_previous VARCHAR(255);
  IF p_actor_role <> 'student' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT photo_path INTO v_previous FROM users WHERE id = p_actor_user_id;
  UPDATE users SET photo_path = p_photo_path, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_actor_user_id;
  SELECT v_previous AS previous_photo_path;
END$$

-- Directorio de alumnos. El instructor ve solo a los alumnos de sus
-- grupos y SIN telefono; el admin del tenant ve a todos los de su tenant
-- con telefono (el super admin, a todos).
CREATE PROCEDURE sp_student_profiles_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT u.id, u.full_name, u.email, u.is_active, r.code AS role_code, u.public_headline AS headline, u.public_bio AS bio, u.photo_path,
         u.linkedin_url, u.github_url, u.portfolio_url, u.contact_email, u.city,
         CASE WHEN p_actor_role IN ('tenant_admin', 'super_admin') THEN u.phone END AS phone,
         u.tenant_id, t.name AS tenant_name,
         GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ' · ') AS programs,
         GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ' · ') AS components,
         -- Programas como 'id|nombre' (por grupo o por inscripcion al programa;
         -- para el instructor, solo los de sus grupos) para filtrar por id.
         GROUP_CONCAT(DISTINCT CONCAT(p.id, '|', p.name) SEPARATOR ';;') AS program_list,
         GROUP_CONCAT(DISTINCT CONCAT(ep.id, '|', ep.name) SEPARATOR ';;') AS enrolled_program_list
  FROM users u
  JOIN master_catalog_values r ON r.id = u.role_id AND (r.code = 'student'
    OR EXISTS (SELECT 1 FROM program_enrollments x WHERE x.student_id = u.id AND x.is_deleted = FALSE))
  LEFT JOIN tenants t ON t.id = u.tenant_id
  LEFT JOIN group_enrollments ge ON ge.student_id = u.id AND ge.is_deleted = FALSE
  LEFT JOIN component_groups g ON g.id = ge.group_id AND g.is_deleted = FALSE
    AND (p_actor_role <> 'instructor' OR g.instructor_id = p_actor_user_id)
  LEFT JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  LEFT JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  LEFT JOIN program_enrollments pe ON pe.student_id = u.id AND pe.is_deleted = FALSE AND p_actor_role <> 'instructor'
  LEFT JOIN training_programs ep ON ep.id = pe.program_id AND ep.is_deleted = FALSE
  WHERE u.is_deleted = FALSE
    AND (p_actor_role = 'super_admin' OR u.tenant_id <=> p_actor_tenant_id)
    AND u.is_active = TRUE
  GROUP BY u.id, u.full_name, u.email, u.is_active, r.code, u.public_headline, u.public_bio, u.photo_path,
           u.linkedin_url, u.github_url, u.portfolio_url, u.contact_email, u.city, u.phone, u.tenant_id, t.name
  HAVING p_actor_role <> 'instructor' OR COUNT(c.id) > 0
  ORDER BY u.full_name;
END$$

-- ===================================================================
-- Reacciones y feedback de los alumnos.
CREATE PROCEDURE sp_reactions_set(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_topic_id BIGINT UNSIGNED,
  IN p_satisfaction TINYINT UNSIGNED, IN p_wants_repeat BOOLEAN
)
BEGIN
  DECLARE v_status VARCHAR(80);
  DECLARE v_date DATE;
  IF p_actor_role <> 'student' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_satisfaction IS NOT NULL AND (p_satisfaction < 1 OR p_satisfaction > 5) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_satisfaction';
  END IF;
  SELECT sv.code, t.scheduled_on INTO v_status, v_date
  FROM topics t
  JOIN group_enrollments ge ON ge.group_id = t.group_id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
  JOIN master_catalog_values sv ON sv.id = t.status_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  -- Solo se califica lo que ya se dicto (o ya paso su fecha).
  IF v_status <> 'completed' AND (v_date IS NULL OR v_date > CURDATE()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'topic_not_taught_yet';
  END IF;

  INSERT INTO topic_reactions (topic_id, student_id, satisfaction, wants_repeat)
  VALUES (p_topic_id, p_actor_user_id, p_satisfaction, COALESCE(p_wants_repeat, FALSE))
  ON DUPLICATE KEY UPDATE satisfaction = VALUES(satisfaction), wants_repeat = VALUES(wants_repeat), updated_at = NOW();
END$$

CREATE PROCEDURE sp_reactions_list_mine(IN p_actor_user_id BIGINT UNSIGNED)
BEGIN
  SELECT topic_id, satisfaction, wants_repeat FROM topic_reactions WHERE student_id = p_actor_user_id;
END$$

-- Totales por tema. El instructor ve solo sus grupos (cantidades, sin
-- nombres de alumnos); el admin, todo su tenant.
CREATE PROCEDURE sp_reactions_summary(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT t.id AS topic_id, t.title AS topic_title, t.scheduled_on, t.sort_order,
         g.id AS group_id, g.name AS group_name, c.id AS component_id, c.name AS component_name,
         p.id AS program_id, p.name AS program_name, g.instructor_id, iu.full_name AS instructor_name,
         COUNT(r.satisfaction) AS votes, ROUND(AVG(r.satisfaction), 2) AS avg_satisfaction,
         SUM(r.satisfaction = 1) AS s1, SUM(r.satisfaction = 2) AS s2, SUM(r.satisfaction = 3) AS s3,
         SUM(r.satisfaction = 4) AS s4, SUM(r.satisfaction = 5) AS s5,
         SUM(r.wants_repeat) AS repeat_count, COUNT(r.id) AS reactions
  FROM topic_reactions r
  JOIN topics t ON t.id = r.topic_id AND t.is_deleted = FALSE
  JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
  JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  LEFT JOIN users iu ON iu.id = g.instructor_id
  WHERE (p_actor_role = 'super_admin' OR p.tenant_id <=> p_actor_tenant_id)
    AND (p_actor_role <> 'instructor' OR g.instructor_id = p_actor_user_id)
  GROUP BY t.id, t.title, t.scheduled_on, t.sort_order, g.id, g.name, c.id, c.name, p.id, p.name, g.instructor_id, iu.full_name
  ORDER BY p.name, c.name, t.sort_order, t.id;
END$$

-- p_target_type: topic (p_topic_id), component (p_component_id) o
-- instructor (p_group_id: el profesor de ese grupo). El alumno debe estar
-- inscrito. Freno de abuso: maximo 10 comentarios por dia.
CREATE PROCEDURE sp_feedback_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_target_type VARCHAR(20),
  IN p_topic_id BIGINT UNSIGNED, IN p_component_id BIGINT UNSIGNED, IN p_group_id BIGINT UNSIGNED, IN p_message VARCHAR(500)
)
BEGIN
  DECLARE v_group_id BIGINT UNSIGNED;
  DECLARE v_component_id BIGINT UNSIGNED;
  DECLARE v_instructor_id BIGINT UNSIGNED;
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_today INT;
  IF p_actor_role <> 'student' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_message IS NULL OR CHAR_LENGTH(TRIM(p_message)) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'feedback_empty';
  END IF;
  SELECT COUNT(*) INTO v_today FROM student_feedback
  WHERE student_id = p_actor_user_id AND created_at >= CURDATE() AND is_deleted = FALSE;
  IF v_today >= 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'feedback_daily_limit';
  END IF;

  IF p_target_type = 'topic' THEN
    SELECT g.id, g.component_id, g.instructor_id INTO v_group_id, v_component_id, v_instructor_id
    FROM topics t JOIN component_groups g ON g.id = t.group_id
    JOIN group_enrollments ge ON ge.group_id = g.id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
    WHERE t.id = p_topic_id AND t.is_deleted = FALSE AND g.is_deleted = FALSE;
  ELSEIF p_target_type = 'component' THEN
    SELECT g.id, g.component_id, g.instructor_id INTO v_group_id, v_component_id, v_instructor_id
    FROM component_groups g
    JOIN group_enrollments ge ON ge.group_id = g.id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
    WHERE g.component_id = p_component_id AND g.is_deleted = FALSE
    LIMIT 1;
  ELSEIF p_target_type = 'instructor' THEN
    SELECT g.id, g.component_id, g.instructor_id INTO v_group_id, v_component_id, v_instructor_id
    FROM component_groups g
    JOIN group_enrollments ge ON ge.group_id = g.id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE
    WHERE g.id = p_group_id AND g.is_deleted = FALSE AND g.instructor_id IS NOT NULL;
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_feedback_target';
  END IF;
  IF v_group_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = p_actor_user_id;

  INSERT INTO student_feedback (tenant_id, student_id, target_type, topic_id, group_id, component_id, instructor_id, message)
  VALUES (v_tenant_id, p_actor_user_id, p_target_type, IF(p_target_type = 'topic', p_topic_id, NULL), v_group_id, v_component_id, v_instructor_id, TRIM(p_message));
  SELECT LAST_INSERT_ID() AS feedback_id;
END$$

CREATE PROCEDURE sp_feedback_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT f.id, f.target_type, f.message, f.created_at, f.student_id, su.full_name AS student_name,
         f.topic_id, t.title AS topic_title, f.component_id, c.name AS component_name,
         p.id AS program_id, p.name AS program_name, f.group_id, g.name AS group_name,
         f.instructor_id, iu.full_name AS instructor_name
  FROM student_feedback f
  JOIN users su ON su.id = f.student_id
  LEFT JOIN topics t ON t.id = f.topic_id
  LEFT JOIN components c ON c.id = f.component_id
  LEFT JOIN training_programs p ON p.id = c.program_id
  LEFT JOIN component_groups g ON g.id = f.group_id
  LEFT JOIN users iu ON iu.id = f.instructor_id
  WHERE f.is_deleted = FALSE AND (p_actor_role = 'super_admin' OR f.tenant_id <=> p_actor_tenant_id)
  ORDER BY f.created_at DESC, f.id DESC
  LIMIT 500;
END$$

-- ===================================================================
-- Inasistencias y cambios de profesores; inasistencias de alumnos para
-- los indicadores. "Puntualidad del aviso" (timeliness), igual para ambos:
--   advance        aviso antes del dia de la clase
--   same_day       aviso el mismo dia
--   late_justified sin aviso previo, justificada despues
--   unjustified    sin aviso ni justificacion (o rechazada)
CREATE PROCEDURE sp_instructor_absences_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_topic_id BIGINT UNSIGNED, IN p_reason VARCHAR(500), IN p_notified_at DATETIME,
  IN p_justification VARCHAR(20), IN p_substitute_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_group_id BIGINT UNSIGNED;
  DECLARE v_instructor_id BIGINT UNSIGNED;
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_date DATE;
  DECLARE v_title VARCHAR(180);
  DECLARE v_component VARCHAR(160);
  DECLARE v_id BIGINT UNSIGNED;

  IF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason)) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'reason_required';
  END IF;
  SELECT g.id, g.instructor_id, p.tenant_id, t.scheduled_on, t.title, c.name
    INTO v_group_id, v_instructor_id, v_tenant_id, v_date, v_title, v_component
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;
  IF v_group_id IS NULL OR v_date IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF v_instructor_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_invalid';
  END IF;
  IF p_actor_role = 'instructor' AND v_instructor_id <> p_actor_user_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_actor_role = 'instructor' AND v_date < CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'class_already_passed';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM instructor_absences WHERE topic_id = p_topic_id AND instructor_id = v_instructor_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'absence_already_recorded';
  END IF;
  IF p_actor_role <> 'instructor' AND p_justification IS NOT NULL AND p_justification NOT IN ('pending', 'justified', 'unjustified') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;

  INSERT INTO instructor_absences (tenant_id, instructor_id, topic_id, group_id, absence_on, reason, notified_at, source,
                                   justification, resolved_at, resolved_by, substitute_id, created_by)
  VALUES (v_tenant_id, v_instructor_id, p_topic_id, v_group_id, v_date, TRIM(p_reason),
          IF(p_actor_role = 'instructor', NOW(), p_notified_at),
          IF(p_actor_role = 'instructor', 'instructor', 'admin'),
          IF(p_actor_role = 'instructor', 'pending', COALESCE(p_justification, 'pending')),
          IF(p_actor_role <> 'instructor' AND COALESCE(p_justification, 'pending') <> 'pending', NOW(), NULL),
          IF(p_actor_role <> 'instructor' AND COALESCE(p_justification, 'pending') <> 'pending', p_actor_user_id, NULL),
          p_substitute_id, p_actor_user_id);
  SET v_id = LAST_INSERT_ID();

  -- El aviso del propio profesor les llega a los admins del tenant.
  IF p_actor_role = 'instructor' THEN
    INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
    SELECT v_tenant_id,
           (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_TYPE' AND v.code = 'instructor_absence_notice'),
           (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_PRIORITY' AND v.code = 'high'),
           au.id,
           LEFT(CONCAT(iu.full_name, ' avisó que no dictará su clase'), 200),
           LEFT(CONCAT(DATE_FORMAT(v_date, '%d/%m'), ' · ', v_component, ': ', v_title, ' — Motivo: ', TRIM(p_reason)), 1000),
           (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_STATUS' AND v.code = 'open'),
           'instructor_absence', v_id, p_actor_user_id
    FROM users au
    JOIN master_catalog_values r ON r.id = au.role_id AND r.code = 'tenant_admin'
    JOIN users iu ON iu.id = v_instructor_id
    WHERE au.tenant_id <=> v_tenant_id AND au.is_deleted = FALSE AND au.is_active = TRUE;
  END IF;
  SELECT v_id AS absence_id;
END$$

CREATE PROCEDURE sp_instructor_absences_resolve(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_absence_id BIGINT UNSIGNED, IN p_justification VARCHAR(20), IN p_note VARCHAR(500)
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_found INT DEFAULT 0;
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_justification NOT IN ('pending', 'justified', 'unjustified') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;
  SELECT COUNT(*), MAX(tenant_id) INTO v_found, v_tenant_id FROM instructor_absences WHERE id = p_absence_id AND is_deleted = FALSE;
  IF v_found = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;
  UPDATE instructor_absences
  SET justification = p_justification, justification_note = NULLIF(TRIM(p_note), ''),
      resolved_at = IF(p_justification = 'pending', NULL, NOW()), resolved_by = IF(p_justification = 'pending', NULL, p_actor_user_id)
  WHERE id = p_absence_id;
END$$

-- El profesor retira su aviso (si la clase no paso); el admin puede
-- anular cualquier registro de su tenant.
CREATE PROCEDURE sp_instructor_absences_cancel(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_absence_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_instructor_id BIGINT UNSIGNED;
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_date DATE;
  SELECT instructor_id, tenant_id, absence_on INTO v_instructor_id, v_tenant_id, v_date
  FROM instructor_absences WHERE id = p_absence_id AND is_deleted = FALSE;
  IF v_instructor_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role = 'instructor' AND (v_instructor_id <> p_actor_user_id OR v_date < CURDATE()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  UPDATE instructor_absences SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id WHERE id = p_absence_id;
  UPDATE alerts SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id
  WHERE source_type = 'instructor_absence' AND source_id = p_absence_id AND read_at IS NULL AND is_deleted = FALSE;
END$$

CREATE PROCEDURE sp_instructor_absences_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT a.id, a.instructor_id, iu.full_name AS instructor_name, a.topic_id, t.title AS topic_title,
         a.group_id, g.name AS group_name, c.id AS component_id, c.name AS component_name, p.id AS program_id, p.name AS program_name,
         a.absence_on, a.reason, a.notified_at, a.source, a.justification, a.justification_note, a.resolved_at,
         a.substitute_id, su.full_name AS substitute_name, a.created_at,
         CASE
           WHEN a.notified_at IS NOT NULL AND DATE(a.notified_at) < a.absence_on THEN 'advance'
           WHEN a.notified_at IS NOT NULL AND DATE(a.notified_at) = a.absence_on THEN 'same_day'
           WHEN a.justification = 'justified' THEN 'late_justified'
           ELSE 'unjustified'
         END AS timeliness
  FROM instructor_absences a
  JOIN users iu ON iu.id = a.instructor_id
  JOIN topics t ON t.id = a.topic_id
  JOIN component_groups g ON g.id = a.group_id
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  LEFT JOIN users su ON su.id = a.substitute_id
  WHERE a.is_deleted = FALSE
    AND (p_actor_role = 'super_admin' OR a.tenant_id <=> p_actor_tenant_id)
    AND (p_actor_role <> 'instructor' OR a.instructor_id = p_actor_user_id)
  ORDER BY a.absence_on DESC, a.id DESC;
END$$

CREATE PROCEDURE sp_instructor_changes_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT ch.id, ch.group_id, g.name AS group_name, c.name AS component_name, p.id AS program_id, p.name AS program_name,
         ch.previous_instructor_id, pu.full_name AS previous_instructor_name, ch.new_instructor_id, nu.full_name AS new_instructor_name,
         ch.reason_code, ch.note, ch.effective_on, ch.created_at, cu.full_name AS created_by_name
  FROM instructor_changes ch
  JOIN component_groups g ON g.id = ch.group_id
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN users pu ON pu.id = ch.previous_instructor_id
  LEFT JOIN users nu ON nu.id = ch.new_instructor_id
  LEFT JOIN users cu ON cu.id = ch.created_by
  WHERE p_actor_role = 'super_admin' OR ch.tenant_id <=> p_actor_tenant_id
  ORDER BY ch.effective_on DESC, ch.id DESC;
END$$

-- Carga de cada profesor (grupos y clases) para relativizar sus faltas.
CREATE PROCEDURE sp_instructor_indicators(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT u.id AS instructor_id, u.full_name AS instructor_name, u.is_active,
         COUNT(DISTINCT g.id) AS groups_count,
         COUNT(DISTINCT t.id) AS topics_total,
         COUNT(DISTINCT CASE WHEN t.scheduled_on < CURDATE() THEN t.id END) AS topics_past,
         COUNT(DISTINCT CASE WHEN sv.code = 'completed' THEN t.id END) AS topics_completed
  FROM users u
  JOIN master_catalog_values r ON r.id = u.role_id AND r.code = 'instructor'
  LEFT JOIN component_groups g ON g.instructor_id = u.id AND g.is_deleted = FALSE
  LEFT JOIN topics t ON t.group_id = g.id AND t.is_deleted = FALSE
  LEFT JOIN master_catalog_values sv ON sv.id = t.status_id
  WHERE u.is_deleted = FALSE AND (p_actor_role = 'super_admin' OR u.tenant_id <=> p_actor_tenant_id)
  GROUP BY u.id, u.full_name, u.is_active
  ORDER BY u.full_name;
END$$

-- Clases (con fecha) sobre las que el admin puede registrar una falta.
CREATE PROCEDURE sp_instructor_absence_classes(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT t.id AS topic_id, t.title AS topic_title, t.scheduled_on, g.id AS group_id, g.name AS group_name,
         c.name AS component_name, p.name AS program_name, g.instructor_id, iu.full_name AS instructor_name
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE AND g.instructor_id IS NOT NULL
  JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  JOIN users iu ON iu.id = g.instructor_id
  WHERE t.is_deleted = FALSE AND t.scheduled_on IS NOT NULL
    AND t.scheduled_on BETWEEN DATE_SUB(CURDATE(), INTERVAL 120 DAY) AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)
    AND (p_actor_role = 'super_admin' OR p.tenant_id <=> p_actor_tenant_id)
  ORDER BY iu.full_name, t.scheduled_on;
END$$

-- Cada inasistencia de alumno (registro de asistencia ausente, ausente
-- justificado o con permiso) con su aviso, para medir la puntualidad.
CREATE PROCEDURE sp_student_absence_events(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT x.*, CASE
           WHEN x.leave_status IN ('pending', 'approved') AND DATE(x.leave_created_at) < x.class_on THEN 'advance'
           WHEN x.leave_status IN ('pending', 'approved') AND DATE(x.leave_created_at) = x.class_on THEN 'same_day'
           WHEN x.attendance_code IN ('justified_absent', 'approved_leave') OR x.leave_status = 'approved' THEN 'late_justified'
           ELSE 'unjustified'
         END AS timeliness
  FROM (
    SELECT a.id AS attendance_id, a.student_id, su.full_name AS student_name, t.id AS topic_id, t.title AS topic_title,
           t.scheduled_on AS class_on, c.id AS component_id, c.name AS component_name, p.id AS program_id, p.name AS program_name,
           iu.full_name AS instructor_name, av.code AS attendance_code, av.label AS attendance_label, a.observations,
           (SELECT l.id FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id
            WHERE l.student_id = a.student_id AND l.is_deleted = FALSE AND ls.code <> 'cancelled'
              AND (l.topic_id = t.id OR (l.topic_id IS NULL AND t.scheduled_on BETWEEN l.starts_on AND l.ends_on))
            ORDER BY (ls.code = 'approved') DESC, l.created_at LIMIT 1) AS leave_id,
           (SELECT ls.code FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id
            WHERE l.student_id = a.student_id AND l.is_deleted = FALSE AND ls.code <> 'cancelled'
              AND (l.topic_id = t.id OR (l.topic_id IS NULL AND t.scheduled_on BETWEEN l.starts_on AND l.ends_on))
            ORDER BY (ls.code = 'approved') DESC, l.created_at LIMIT 1) AS leave_status,
           (SELECT l.created_at FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id
            WHERE l.student_id = a.student_id AND l.is_deleted = FALSE AND ls.code <> 'cancelled'
              AND (l.topic_id = t.id OR (l.topic_id IS NULL AND t.scheduled_on BETWEEN l.starts_on AND l.ends_on))
            ORDER BY (ls.code = 'approved') DESC, l.created_at LIMIT 1) AS leave_created_at,
           (SELECT l.reason FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id
            WHERE l.student_id = a.student_id AND l.is_deleted = FALSE AND ls.code <> 'cancelled'
              AND (l.topic_id = t.id OR (l.topic_id IS NULL AND t.scheduled_on BETWEEN l.starts_on AND l.ends_on))
            ORDER BY (ls.code = 'approved') DESC, l.created_at LIMIT 1) AS leave_reason
    FROM attendance a
    JOIN master_catalog_values av ON av.id = a.attendance_status_id AND av.code IN ('absent', 'justified_absent', 'approved_leave')
    JOIN topics t ON t.id = a.topic_id AND t.is_deleted = FALSE AND t.scheduled_on IS NOT NULL
    JOIN component_groups g ON g.id = t.group_id
    JOIN components c ON c.id = g.component_id
    JOIN training_programs p ON p.id = c.program_id
    JOIN users su ON su.id = a.student_id
    LEFT JOIN users iu ON iu.id = g.instructor_id
    WHERE a.is_deleted = FALSE AND (p_actor_role = 'super_admin' OR p.tenant_id <=> p_actor_tenant_id)
  ) x
  ORDER BY x.class_on DESC, x.student_name;
END$$

-- Sesiones registradas y asistidas por alumno (para el % de asistencia).
CREATE PROCEDURE sp_student_attendance_totals(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT su.id AS student_id, su.full_name AS student_name,
         COUNT(a.id) AS sessions, SUM(av.code IN ('present', 'late')) AS attended,
         SUM(av.code IN ('late', 'left_early')) AS late_or_left
  FROM users su
  JOIN master_catalog_values r ON r.id = su.role_id AND (r.code = 'student'
    OR EXISTS (SELECT 1 FROM program_enrollments x WHERE x.student_id = su.id AND x.is_deleted = FALSE))
  LEFT JOIN attendance a ON a.student_id = su.id AND a.is_deleted = FALSE
  LEFT JOIN master_catalog_values av ON av.id = a.attendance_status_id
  WHERE su.is_deleted = FALSE AND su.is_active = TRUE AND (p_actor_role = 'super_admin' OR su.tenant_id <=> p_actor_tenant_id)
  GROUP BY su.id, su.full_name
  ORDER BY su.full_name;
END$$

-- ===================================================================
-- Recuperacion de clave por solicitud al admin. Nunca revela si el correo
-- existe. Maximo 5 solicitudes por IP por hora y una pendiente por usuario
-- cada 30 minutos. Avisa a los admins del tenant (si quien pide es admin de
-- tenant o no tiene tenant, al super admin).
CREATE PROCEDURE sp_password_reset_request(IN p_email VARCHAR(190), IN p_ip_address VARCHAR(64))
BEGIN
  DECLARE v_user_id BIGINT UNSIGNED;
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_role VARCHAR(80);
  DECLARE v_name VARCHAR(160);
  DECLARE v_recent INT;
  DECLARE v_id BIGINT UNSIGNED;

  SELECT COUNT(*) INTO v_recent FROM password_reset_requests
  WHERE ip_address <=> p_ip_address AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR);
  IF v_recent >= 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'too_many_requests';
  END IF;

  SELECT u.id, u.tenant_id, r.code, u.full_name INTO v_user_id, v_tenant_id, v_role, v_name
  FROM users u JOIN master_catalog_values r ON r.id = u.role_id
  WHERE u.email = TRIM(p_email) AND u.is_deleted = FALSE AND u.is_active = TRUE
  LIMIT 1;

  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM password_reset_requests WHERE user_id = v_user_id AND status = 'pending' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
  ) THEN
    SET v_user_id = NULL;
  END IF;

  INSERT INTO password_reset_requests (user_id, tenant_id, email, ip_address)
  VALUES (v_user_id, v_tenant_id, LEFT(TRIM(p_email), 190), p_ip_address);
  SET v_id = LAST_INSERT_ID();

  IF v_user_id IS NOT NULL THEN
    INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
    SELECT v_tenant_id,
           (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_TYPE' AND v.code = 'password_reset_request'),
           (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_PRIORITY' AND v.code = 'medium'),
           au.id,
           LEFT(CONCAT(v_name, ' pidió recuperar su clave'), 200),
           'Genera un enlace para que cree una nueva clave desde Usuarios → Solicitudes de recuperación.',
           (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_STATUS' AND v.code = 'open'),
           'password_reset', v_id, v_user_id
    FROM users au
    JOIN master_catalog_values ar ON ar.id = au.role_id
    WHERE au.is_deleted = FALSE AND au.is_active = TRUE AND au.id <> v_user_id
      AND ((v_role IN ('student', 'instructor') AND v_tenant_id IS NOT NULL AND ar.code = 'tenant_admin' AND au.tenant_id = v_tenant_id)
        OR ((v_role IN ('tenant_admin', 'super_admin') OR v_tenant_id IS NULL) AND ar.code = 'super_admin'));
  END IF;
END$$

CREATE PROCEDURE sp_password_reset_requests_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT MAX(pr.id) AS id, pr.user_id, u.full_name, u.email, r.code AS role_code, r.label AS role_label, t.name AS tenant_name,
         MAX(pr.created_at) AS created_at, COUNT(*) AS requests
  FROM password_reset_requests pr
  JOIN users u ON u.id = pr.user_id AND u.is_deleted = FALSE
  JOIN master_catalog_values r ON r.id = u.role_id
  LEFT JOIN tenants t ON t.id = u.tenant_id
  WHERE pr.status = 'pending'
    AND (p_actor_role = 'super_admin' OR (u.tenant_id <=> p_actor_tenant_id AND r.code IN ('student', 'instructor')))
  GROUP BY pr.user_id, u.full_name, u.email, r.code, r.label, t.name
  ORDER BY created_at DESC;
END$$

-- Cierra las solicitudes pendientes de un usuario (resolved al generar el
-- enlace; dismissed si el admin la descarta).
CREATE PROCEDURE sp_password_reset_requests_resolve(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_request_id BIGINT UNSIGNED, IN p_status VARCHAR(20)
)
BEGIN
  DECLARE v_user_id BIGINT UNSIGNED;
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_role VARCHAR(80);
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_status NOT IN ('resolved', 'dismissed') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;
  SELECT pr.user_id, u.tenant_id, r.code INTO v_user_id, v_tenant_id, v_role
  FROM password_reset_requests pr JOIN users u ON u.id = pr.user_id JOIN master_catalog_values r ON r.id = u.role_id
  WHERE pr.id = p_request_id;
  IF v_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND (NOT (v_tenant_id <=> p_actor_tenant_id) OR v_role NOT IN ('student', 'instructor')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  UPDATE password_reset_requests SET status = p_status, resolved_at = NOW(), resolved_by = p_actor_user_id
  WHERE user_id = v_user_id AND status = 'pending';
  UPDATE alerts SET read_at = NOW(), read_by = p_actor_user_id,
         status_id = (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_STATUS' AND v.code = 'read')
  WHERE source_type = 'password_reset' AND created_by = v_user_id AND read_at IS NULL AND is_deleted = FALSE;
  SELECT v_user_id AS user_id;
END$$

-- ===================================================================
-- Generacion automatica de horarios: disponibilidad de profesores y los
-- datos que usa el planificador (server/schedulePlanner.js).
-- Disponibilidad por programa. Admin y super admin ven a todos los
-- profesores del tenant del programa (con cuantos grupos dictan en el); el
-- profesor solo la suya. Sin programa, el profesor recibe la de todos sus
-- programas. locked = el horario del programa ya se cerro.
CREATE PROCEDURE sp_instructor_availability_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_program_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
    IF v_tenant_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
    END IF;
    IF p_actor_role <> 'super_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
    END IF;
    SELECT u.id AS instructor_id, u.full_name AS instructor_name, u.email AS instructor_email, u.tenant_id,
           p_program_id AS program_id, (p.schedule_closed_at IS NOT NULL) AS locked,
           (SELECT COUNT(*) FROM component_groups g JOIN components c ON c.id = g.component_id
             WHERE c.program_id = p_program_id AND g.instructor_id = u.id AND g.is_deleted = FALSE AND c.is_deleted = FALSE) AS group_count,
           a.id, a.weekday, TIME_FORMAT(a.start_time, '%H:%i') AS start_time, TIME_FORMAT(a.end_time, '%H:%i') AS end_time
    FROM users u
    JOIN master_catalog_values r ON r.id = u.role_id AND r.code = 'instructor'
    JOIN training_programs p ON p.id = p_program_id
    LEFT JOIN instructor_availability a ON a.instructor_id = u.id AND a.program_id = p_program_id
    WHERE u.is_deleted = FALSE AND u.is_active = TRUE AND u.tenant_id = v_tenant_id
      AND (p_actor_role <> 'instructor' OR u.id = p_actor_user_id)
    ORDER BY u.full_name, a.weekday, a.start_time;
  ELSE
    IF p_actor_role <> 'instructor' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
    END IF;
    -- Programas donde dicta algun grupo, con o sin disponibilidad cargada.
    SELECT u.id AS instructor_id, u.full_name AS instructor_name, u.email AS instructor_email, u.tenant_id,
           p.id AS program_id, p.name AS program_name, p.cohort, p.starts_on, p.ends_on,
           (p.schedule_closed_at IS NOT NULL) AS locked,
           (SELECT COUNT(*) FROM component_groups g JOIN components c ON c.id = g.component_id
             WHERE c.program_id = p.id AND g.instructor_id = u.id AND g.is_deleted = FALSE AND c.is_deleted = FALSE) AS group_count,
           a.id, a.weekday, TIME_FORMAT(a.start_time, '%H:%i') AS start_time, TIME_FORMAT(a.end_time, '%H:%i') AS end_time
    FROM users u
    JOIN training_programs p ON p.is_deleted = FALSE AND p.id IN (
      SELECT c.program_id FROM component_groups g JOIN components c ON c.id = g.component_id
      WHERE g.instructor_id = u.id AND g.is_deleted = FALSE AND c.is_deleted = FALSE)
    LEFT JOIN instructor_availability a ON a.instructor_id = u.id AND a.program_id = p.id
    WHERE u.id = p_actor_user_id
    ORDER BY p.starts_on DESC, p.id, a.weekday, a.start_time;
  END IF;
END$$

-- Reemplaza la disponibilidad de un profesor en un programa. p_blocks es un
-- JSON [{"weekday":1,"start":"09:00","end":"13:00"}, ...]. Con el horario del
-- programa cerrado ya no se puede cambiar (ni el profesor ni el admin).
CREATE PROCEDURE sp_instructor_availability_set(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_instructor_id BIGINT UNSIGNED, IN p_program_id BIGINT UNSIGNED, IN p_blocks JSON
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_role VARCHAR(80);
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_closed DATETIME;
  DECLARE v_bad INT;
  SELECT u.tenant_id, r.code INTO v_tenant_id, v_role
  FROM users u JOIN master_catalog_values r ON r.id = u.role_id WHERE u.id = p_instructor_id AND u.is_deleted = FALSE;
  IF v_role IS NULL OR v_role <> 'instructor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_invalid';
  END IF;
  SELECT tenant_id, schedule_closed_at INTO v_program_tenant_id, v_closed
  FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF NOT (v_program_tenant_id <=> v_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_invalid';
  END IF;
  IF p_actor_role = 'instructor' AND p_actor_user_id <> p_instructor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  -- El profesor solo carga disponibilidad en programas donde le asignaron un curso.
  IF p_actor_role = 'instructor' AND NOT EXISTS (
    SELECT 1 FROM component_groups g JOIN components c ON c.id = g.component_id
    WHERE c.program_id = p_program_id AND g.instructor_id = p_instructor_id AND g.is_deleted = FALSE AND c.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF v_closed IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'availability_locked';
  END IF;
  SELECT COUNT(*) INTO v_bad
  FROM JSON_TABLE(COALESCE(p_blocks, JSON_ARRAY()), '$[*]' COLUMNS (
    weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) jt
  WHERE jt.weekday IS NULL OR jt.weekday < 0 OR jt.weekday > 6 OR jt.start_time IS NULL OR jt.end_time IS NULL OR jt.start_time >= jt.end_time;
  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_schedule_day';
  END IF;
  -- Con franjas de clase, cada bloque debe caer dentro de una franja de su dia.
  IF EXISTS (SELECT 1 FROM program_schedule_windows WHERE program_id = p_program_id) THEN
    SELECT COUNT(*) INTO v_bad
    FROM JSON_TABLE(COALESCE(p_blocks, JSON_ARRAY()), '$[*]' COLUMNS (
      weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) jt
    WHERE NOT EXISTS (SELECT 1 FROM program_schedule_windows w WHERE w.program_id = p_program_id
      AND w.weekday = jt.weekday AND jt.start_time >= w.start_time AND jt.end_time <= w.end_time);
    IF v_bad > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'availability_outside_window';
    END IF;
  END IF;

  DELETE FROM instructor_availability WHERE instructor_id = p_instructor_id AND program_id = p_program_id;
  INSERT INTO instructor_availability (instructor_id, program_id, weekday, start_time, end_time, created_by)
  SELECT p_instructor_id, p_program_id, jt.weekday, jt.start_time, jt.end_time, p_actor_user_id
  FROM JSON_TABLE(COALESCE(p_blocks, JSON_ARRAY()), '$[*]' COLUMNS (
    weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) jt;
END$$

-- Cursos a los que un profesor, admin o super admin puede inscribirse solo:
-- grupos de programas vigentes de su tenant (super admin: todos), sin los
-- componentes que dicta. clashes = choca con algo que ya dicta o cursa.
CREATE PROCEDURE sp_self_enroll_catalog(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT p.id AS program_id, p.name AS program_name, p.cohort, p.starts_on, p.ends_on, p.tenant_id, tn.name AS tenant_name,
         c.id AS component_id, c.name AS component_name, g.id AS group_id, g.name AS group_name, iu.full_name AS instructor_name,
         (SELECT GROUP_CONCAT(CONCAT(d.weekday, '|', TIME_FORMAT(d.start_time, '%H:%i'), '|', TIME_FORMAT(d.end_time, '%H:%i')) ORDER BY d.weekday SEPARATOR ',')
            FROM component_group_schedule_days d WHERE d.group_id = g.id AND d.is_deleted = FALSE) AS schedule,
         (SELECT MIN(t.scheduled_on) FROM topics t WHERE t.group_id = g.id AND t.is_deleted = FALSE) AS first_date,
         (SELECT MAX(t.scheduled_on) FROM topics t WHERE t.group_id = g.id AND t.is_deleted = FALSE) AS last_date,
         (SELECT COUNT(*) FROM topics t WHERE t.group_id = g.id AND t.is_deleted = FALSE) AS topic_count,
         EXISTS (SELECT 1 FROM group_enrollments ge WHERE ge.group_id = g.id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE) AS enrolled,
         EXISTS (SELECT 1 FROM group_enrollments ge JOIN component_groups go ON go.id = ge.group_id AND go.is_deleted = FALSE
                 WHERE go.component_id = c.id AND go.id <> g.id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE) AS in_other_group,
         EXISTS (
           SELECT 1 FROM topics tc
           JOIN component_group_schedule_days dc ON dc.group_id = tc.group_id AND dc.is_deleted = FALSE AND dc.weekday = DAYOFWEEK(tc.scheduled_on) - 1
           JOIN topics tx ON tx.scheduled_on = tc.scheduled_on AND tx.is_deleted = FALSE AND tx.group_id <> tc.group_id
           JOIN component_groups gx ON gx.id = tx.group_id AND gx.is_deleted = FALSE
           JOIN components cx ON cx.id = gx.component_id AND cx.is_deleted = FALSE
           JOIN training_programs px ON px.id = cx.program_id AND px.is_deleted = FALSE
           JOIN master_catalog_values psx ON psx.id = px.status_id AND psx.code IN ('draft', 'active', 'paused')
           JOIN component_group_schedule_days dx ON dx.group_id = gx.id AND dx.is_deleted = FALSE AND dx.weekday = dc.weekday
           WHERE tc.group_id = g.id AND tc.is_deleted = FALSE AND tc.scheduled_on IS NOT NULL
             AND NOT (dc.end_time <= dx.start_time OR dc.start_time >= dx.end_time)
             AND (gx.instructor_id = p_actor_user_id OR EXISTS (SELECT 1 FROM group_enrollments gex
               WHERE gex.group_id = gx.id AND gex.student_id = p_actor_user_id AND gex.is_deleted = FALSE))
         ) AS clashes
  FROM training_programs p
  JOIN master_catalog_values ps ON ps.id = p.status_id AND ps.code IN ('draft', 'active', 'paused')
  JOIN tenants tn ON tn.id = p.tenant_id
  JOIN components c ON c.program_id = p.id AND c.is_deleted = FALSE
  JOIN component_groups g ON g.component_id = c.id AND g.is_deleted = FALSE
  LEFT JOIN users iu ON iu.id = g.instructor_id
  WHERE p.is_deleted = FALSE AND p.program_type = 'training'
    AND (p_actor_role = 'super_admin' OR p.tenant_id <=> p_actor_tenant_id)
    AND NOT EXISTS (SELECT 1 FROM component_groups gt WHERE gt.component_id = c.id AND gt.instructor_id = p_actor_user_id AND gt.is_deleted = FALSE)
  ORDER BY p.starts_on DESC, p.id, c.sort_order, c.id, g.name;
END$$

-- Autoinscripcion en un grupo (y en su programa si hace falta).
CREATE PROCEDURE sp_group_self_enroll(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_id BIGINT UNSIGNED;
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_component_id BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT p.id, p.tenant_id, c.id INTO v_program_id, v_tenant_id, v_component_id
  FROM component_groups g JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  JOIN master_catalog_values ps ON ps.id = p.status_id AND ps.code IN ('draft', 'active', 'paused')
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;
  IF v_program_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_active';
  END IF;
  IF p_actor_role <> 'super_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM component_groups gt WHERE gt.component_id = v_component_id AND gt.instructor_id = p_actor_user_id AND gt.is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'teaches_this_component';
  END IF;
  IF EXISTS (SELECT 1 FROM group_enrollments ge WHERE ge.group_id = p_group_id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'already_enrolled';
  END IF;
  IF EXISTS (SELECT 1 FROM group_enrollments ge JOIN component_groups go ON go.id = ge.group_id AND go.is_deleted = FALSE
             WHERE go.component_id = v_component_id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'already_in_component';
  END IF;
  IF EXISTS (
    SELECT 1 FROM topics tc
    JOIN component_group_schedule_days dc ON dc.group_id = tc.group_id AND dc.is_deleted = FALSE AND dc.weekday = DAYOFWEEK(tc.scheduled_on) - 1
    JOIN topics tx ON tx.scheduled_on = tc.scheduled_on AND tx.is_deleted = FALSE AND tx.group_id <> tc.group_id
    JOIN component_groups gx ON gx.id = tx.group_id AND gx.is_deleted = FALSE
    JOIN components cx ON cx.id = gx.component_id AND cx.is_deleted = FALSE
    JOIN training_programs px ON px.id = cx.program_id AND px.is_deleted = FALSE
    JOIN master_catalog_values psx ON psx.id = px.status_id AND psx.code IN ('draft', 'active', 'paused')
    JOIN component_group_schedule_days dx ON dx.group_id = gx.id AND dx.is_deleted = FALSE AND dx.weekday = dc.weekday
    WHERE tc.group_id = p_group_id AND tc.is_deleted = FALSE AND tc.scheduled_on IS NOT NULL
      AND NOT (dc.end_time <= dx.start_time OR dc.start_time >= dx.end_time)
      AND (gx.instructor_id = p_actor_user_id OR EXISTS (SELECT 1 FROM group_enrollments gex
        WHERE gex.group_id = gx.id AND gex.student_id = p_actor_user_id AND gex.is_deleted = FALSE))
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'schedule_clash';
  END IF;

  INSERT INTO program_enrollments (program_id, student_id, created_by) VALUES (v_program_id, p_actor_user_id, p_actor_user_id)
  ON DUPLICATE KEY UPDATE is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL;
  INSERT INTO group_enrollments (group_id, student_id, created_by) VALUES (p_group_id, p_actor_user_id, p_actor_user_id)
  ON DUPLICATE KEY UPDATE is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL;
END$$

-- Darse de baja de un grupo cursado; sin grupos en ese programa, tambien del programa.
CREATE PROCEDURE sp_group_self_unenroll(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_id BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('instructor', 'tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT c.program_id INTO v_program_id FROM component_groups g JOIN components c ON c.id = g.component_id WHERE g.id = p_group_id;
  UPDATE group_enrollments SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id
  WHERE group_id = p_group_id AND student_id = p_actor_user_id AND is_deleted = FALSE;
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM group_enrollments ge JOIN component_groups g ON g.id = ge.group_id JOIN components c ON c.id = g.component_id
                 WHERE c.program_id = v_program_id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE) THEN
    UPDATE program_enrollments SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id
    WHERE program_id = v_program_id AND student_id = p_actor_user_id AND is_deleted = FALSE;
  END IF;
END$$

-- Inicio del admin y del super admin: indicadores reales del tenant (super
-- admin: de todos o de p_tenant_filter). Semana = lunes a domingo actual.
CREATE PROCEDURE sp_admin_dashboard(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant BIGINT UNSIGNED;
  DECLARE v_week_start DATE DEFAULT DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY);
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant = IF(p_actor_role = 'super_admin', p_tenant_filter, p_actor_tenant_id);

  SELECT
    (SELECT COUNT(*) FROM tenants t JOIN master_catalog_values v ON v.id = t.status_id AND v.code = 'active'
      WHERE (v_tenant IS NULL OR t.id = v_tenant)) AS tenants_active,
    (SELECT COUNT(*) FROM training_programs p JOIN master_catalog_values v ON v.id = p.status_id AND v.code = 'active'
      WHERE p.is_deleted = FALSE AND p.program_type = 'training' AND (v_tenant IS NULL OR p.tenant_id = v_tenant)) AS programs_active,
    (SELECT COUNT(DISTINCT pe.student_id) FROM program_enrollments pe
      JOIN training_programs p ON p.id = pe.program_id AND p.is_deleted = FALSE AND p.program_type = 'training'
      JOIN master_catalog_values v ON v.id = p.status_id AND v.code = 'active'
      JOIN users u ON u.id = pe.student_id AND u.is_deleted = FALSE AND u.is_active = TRUE
      WHERE pe.is_deleted = FALSE AND (v_tenant IS NULL OR p.tenant_id = v_tenant)) AS students_active,
    (SELECT COUNT(*) FROM users u JOIN master_catalog_values r ON r.id = u.role_id AND r.code = 'instructor'
      WHERE u.is_deleted = FALSE AND u.is_active = TRUE AND (v_tenant IS NULL OR u.tenant_id = v_tenant)) AS instructors_active,
    (SELECT COUNT(*) FROM topics t JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
      JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
      JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
      JOIN master_catalog_values ps ON ps.id = p.status_id AND ps.code IN ('draft', 'active', 'paused')
      JOIN master_catalog_values ts ON ts.id = t.status_id AND ts.code <> 'cancelled'
      WHERE t.is_deleted = FALSE AND t.scheduled_on = CURDATE() AND (v_tenant IS NULL OR p.tenant_id = v_tenant)) AS classes_today,
    (SELECT COUNT(*) FROM topics t JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
      JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
      JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
      JOIN master_catalog_values ps ON ps.id = p.status_id AND ps.code IN ('draft', 'active', 'paused')
      JOIN master_catalog_values ts ON ts.id = t.status_id AND ts.code <> 'cancelled'
      WHERE t.is_deleted = FALSE AND t.scheduled_on BETWEEN v_week_start AND DATE_ADD(v_week_start, INTERVAL 6 DAY)
        AND (v_tenant IS NULL OR p.tenant_id = v_tenant)) AS classes_this_week,
    (SELECT ROUND(100 * SUM(av.code IN ('present', 'late')) / NULLIF(COUNT(*), 0)) FROM attendance a
      JOIN master_catalog_values av ON av.id = a.attendance_status_id
      JOIN topics t ON t.id = a.topic_id AND t.is_deleted = FALSE
      JOIN component_groups g ON g.id = t.group_id JOIN components c ON c.id = g.component_id
      JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
      JOIN master_catalog_values ps ON ps.id = p.status_id AND ps.code IN ('draft', 'active', 'paused')
      WHERE a.is_deleted = FALSE AND t.scheduled_on >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        AND (v_tenant IS NULL OR p.tenant_id = v_tenant)) AS attendance_rate_30d,
    (SELECT COUNT(*) FROM topics t JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
      JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
      JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
      JOIN master_catalog_values ps ON ps.id = p.status_id AND ps.code IN ('draft', 'active', 'paused')
      JOIN master_catalog_values ts ON ts.id = t.status_id AND ts.code IN ('pending', 'scheduled', 'rescheduled', 'delayed')
      WHERE t.is_deleted = FALSE AND t.scheduled_on < CURDATE() AND (v_tenant IS NULL OR p.tenant_id = v_tenant)) AS topics_overdue,
    (SELECT COUNT(DISTINCT t.id) FROM topics t JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
      JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
      JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
      JOIN master_catalog_values ps ON ps.id = p.status_id AND ps.code IN ('draft', 'active', 'paused')
      JOIN master_catalog_values ts ON ts.id = t.status_id AND ts.code = 'completed'
      WHERE t.is_deleted = FALSE AND t.scheduled_on < CURDATE() AND (v_tenant IS NULL OR p.tenant_id = v_tenant)
        AND EXISTS (SELECT 1 FROM group_enrollments ge JOIN users ue ON ue.id = ge.student_id AND ue.is_active = TRUE AND ue.is_deleted = FALSE
                    WHERE ge.group_id = g.id AND ge.is_deleted = FALSE)
        AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.topic_id = t.id AND a.is_deleted = FALSE)) AS attendance_missing,
    (SELECT COUNT(*) FROM component_groups g JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
      JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE AND p.program_type = 'training'
      JOIN master_catalog_values ps ON ps.id = p.status_id AND ps.code IN ('draft', 'active', 'paused')
      WHERE g.is_deleted = FALSE AND g.instructor_id IS NULL AND (v_tenant IS NULL OR p.tenant_id = v_tenant)) AS groups_without_instructor,
    (SELECT COUNT(*) FROM leave_requests l JOIN master_catalog_values ls ON ls.id = l.status_id AND ls.code = 'pending'
      JOIN users u ON u.id = l.student_id
      WHERE l.is_deleted = FALSE AND (v_tenant IS NULL OR u.tenant_id = v_tenant)) AS leave_pending,
    (SELECT COUNT(*) FROM pre_enrollments pr JOIN master_catalog_values st ON st.id = pr.status_id AND st.code = 'pending'
      JOIN training_programs p ON p.id = pr.program_id
      WHERE (v_tenant IS NULL OR p.tenant_id = v_tenant)) AS pre_enrollments_pending,
    (SELECT COUNT(*) FROM support_tickets st WHERE st.status IN ('open', 'in_progress')
      AND (p_actor_role = 'super_admin' OR st.tenant_id <=> p_actor_tenant_id)
      AND (v_tenant IS NULL OR st.tenant_id <=> v_tenant)) AS tickets_open;
END$$

-- Proximas clases (hoy y los 7 dias siguientes) con hora, curso y profesor.
CREATE PROCEDURE sp_admin_dashboard_agenda(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_tenant_filter BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant BIGINT UNSIGNED;
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SET v_tenant = IF(p_actor_role = 'super_admin', p_tenant_filter, p_actor_tenant_id);
  SELECT t.id AS topic_id, t.title, t.scheduled_on, TIME_FORMAT(d.start_time, '%H:%i') AS start_time, TIME_FORMAT(d.end_time, '%H:%i') AS end_time,
         g.id AS group_id, g.name AS group_name, c.name AS component_name, p.name AS program_name, tn.name AS tenant_name,
         iu.full_name AS instructor_name,
         (SELECT COUNT(*) FROM group_enrollments ge WHERE ge.group_id = g.id AND ge.is_deleted = FALSE AND EXISTS (SELECT 1 FROM users ux WHERE ux.id = ge.student_id AND ux.is_active = TRUE AND ux.is_deleted = FALSE)) AS enrolled
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
  JOIN components c ON c.id = g.component_id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  JOIN master_catalog_values ps ON ps.id = p.status_id AND ps.code IN ('draft', 'active', 'paused')
  JOIN master_catalog_values ts ON ts.id = t.status_id AND ts.code <> 'cancelled'
  JOIN tenants tn ON tn.id = p.tenant_id
  LEFT JOIN users iu ON iu.id = g.instructor_id
  LEFT JOIN component_group_schedule_days d ON d.group_id = g.id AND d.is_deleted = FALSE AND d.weekday = DAYOFWEEK(t.scheduled_on) - 1
  WHERE t.is_deleted = FALSE AND t.scheduled_on BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
    AND (v_tenant IS NULL OR p.tenant_id = v_tenant)
  ORDER BY t.scheduled_on, d.start_time, c.sort_order
  LIMIT 30;
END$$

-- Modo alumno de un profesor, admin o super admin inscrito en algun
-- programa: el tenant de su inscripcion mas reciente (y su marca).
CREATE PROCEDURE sp_auth_student_context(IN p_user_id BIGINT UNSIGNED)
BEGIN
  SELECT p.tenant_id, t.name AS tenant_name, t.logo_path AS tenant_logo_path, t.brand_color AS tenant_brand_color,
         COUNT(DISTINCT pe.program_id) AS programs
  FROM program_enrollments pe
  JOIN training_programs p ON p.id = pe.program_id AND p.is_deleted = FALSE
  JOIN tenants t ON t.id = p.tenant_id
  WHERE pe.student_id = p_user_id AND pe.is_deleted = FALSE
  GROUP BY p.tenant_id, t.name, t.logo_path, t.brand_color
  ORDER BY MAX(pe.created_at) DESC
  LIMIT 1;
END$$

-- Franjas de clase del programa. Las ve cualquiera del tenant (el profesor
-- las necesita para marcar su disponibilidad).
CREATE PROCEDURE sp_program_windows_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role <> 'super_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;
  SELECT weekday, TIME_FORMAT(start_time, '%H:%i') AS start_time, TIME_FORMAT(end_time, '%H:%i') AS end_time
  FROM program_schedule_windows WHERE program_id = p_program_id
  ORDER BY weekday, start_time;
END$$

-- Reemplaza las franjas del programa. p_windows = [{"weekday":1,"start":"18:30","end":"20:00"}, ...]
-- (vacio = sin franjas: horario libre). Las franjas de un mismo dia no se
-- pisan. La disponibilidad que quede fuera de las nuevas franjas se quita.
CREATE PROCEDURE sp_program_windows_set(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_windows JSON
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_closed DATETIME;
  DECLARE v_bad INT;
  SELECT tenant_id, schedule_closed_at INTO v_tenant_id, v_closed FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF v_closed IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'schedule_closed';
  END IF;
  SELECT COUNT(*) INTO v_bad
  FROM JSON_TABLE(COALESCE(p_windows, JSON_ARRAY()), '$[*]' COLUMNS (
    weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) jt
  WHERE jt.weekday IS NULL OR jt.weekday < 0 OR jt.weekday > 6 OR jt.start_time IS NULL OR jt.end_time IS NULL OR jt.start_time >= jt.end_time;
  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_schedule_day';
  END IF;
  SELECT COUNT(*) INTO v_bad
  FROM JSON_TABLE(COALESCE(p_windows, JSON_ARRAY()), '$[*]' COLUMNS (
    n FOR ORDINALITY, weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) a
  JOIN JSON_TABLE(COALESCE(p_windows, JSON_ARRAY()), '$[*]' COLUMNS (
    n FOR ORDINALITY, weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) b
    ON b.weekday = a.weekday AND b.n > a.n AND NOT (a.end_time <= b.start_time OR a.start_time >= b.end_time);
  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'windows_overlap';
  END IF;

  DELETE FROM program_schedule_windows WHERE program_id = p_program_id;
  INSERT INTO program_schedule_windows (program_id, weekday, start_time, end_time, created_by)
  SELECT p_program_id, jt.weekday, jt.start_time, jt.end_time, p_actor_user_id
  FROM JSON_TABLE(COALESCE(p_windows, JSON_ARRAY()), '$[*]' COLUMNS (
    weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) jt;
  DELETE a FROM instructor_availability a
  WHERE a.program_id = p_program_id
    AND EXISTS (SELECT 1 FROM program_schedule_windows w0 WHERE w0.program_id = p_program_id)
    AND NOT EXISTS (SELECT 1 FROM program_schedule_windows w WHERE w.program_id = p_program_id
      AND w.weekday = a.weekday AND a.start_time >= w.start_time AND a.end_time <= w.end_time);
  SELECT ROW_COUNT() AS availability_removed;
END$$

-- Cierra (o reabre) el horario de un programa. Cerrado: no se regenera y la
-- disponibilidad de sus profesores queda fija.
CREATE PROCEDURE sp_programs_schedule_close(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_closed BOOLEAN
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  UPDATE training_programs
  SET schedule_closed_at = IF(p_closed, COALESCE(schedule_closed_at, NOW()), NULL),
      schedule_closed_by = IF(p_closed, COALESCE(schedule_closed_by, p_actor_user_id), NULL),
      updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_program_id;
END$$

-- Aplica de una vez el plan del generador a un programa: horario semanal de
-- cada grupo y la fecha exacta de cada tema pendiente o programado, en
-- orden. p_plan = [{"group_id":1,"days":[{weekday,start,end}],"dates":["2026-01-05",...]}].
-- Todo o nada: si alguna fecha cae en feriado, cruza al profesor con otra
-- clase ese dia o cruza a dos componentes del programa a la misma hora, no
-- se guarda nada.
CREATE PROCEDURE sp_topics_apply_plan(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_plan JSON
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_closed DATETIME;
  DECLARE v_scheduled_status_id BIGINT UNSIGNED;
  DECLARE v_count INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_plan_groups, tmp_plan_dates, tmp_plan_topics;
    RESIGNAL;
  END;

  SELECT tenant_id, schedule_closed_at INTO v_tenant_id, v_closed FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF v_closed IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'schedule_closed';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_plan_groups, tmp_plan_dates, tmp_plan_topics;
  CREATE TEMPORARY TABLE tmp_plan_groups (group_id BIGINT UNSIGNED PRIMARY KEY, days JSON);
  CREATE TEMPORARY TABLE tmp_plan_dates (group_id BIGINT UNSIGNED, pos INT, d DATE, PRIMARY KEY (group_id, pos));
  CREATE TEMPORARY TABLE tmp_plan_topics (topic_id BIGINT UNSIGNED PRIMARY KEY, group_id BIGINT UNSIGNED, pos INT);

  INSERT INTO tmp_plan_groups (group_id, days)
  SELECT jt.group_id, jt.days FROM JSON_TABLE(p_plan, '$[*]' COLUMNS (group_id BIGINT UNSIGNED PATH '$.group_id', days JSON PATH '$.days')) jt;
  INSERT INTO tmp_plan_dates (group_id, pos, d)
  SELECT jt.group_id, jt.pos, jt.d FROM JSON_TABLE(p_plan, '$[*]' COLUMNS (
    group_id BIGINT UNSIGNED PATH '$.group_id',
    NESTED PATH '$.dates[*]' COLUMNS (pos FOR ORDINALITY, d DATE PATH '$'))) jt
  WHERE jt.d IS NOT NULL;

  -- Todos los grupos deben ser de este programa.
  SELECT COUNT(*) INTO v_count FROM tmp_plan_groups pg
  LEFT JOIN component_groups g ON g.id = pg.group_id AND g.is_deleted = FALSE
  LEFT JOIN components c ON c.id = g.component_id AND c.program_id = p_program_id AND c.is_deleted = FALSE
  WHERE c.id IS NULL;
  IF v_count > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;

  INSERT INTO tmp_plan_topics (topic_id, group_id, pos)
  SELECT t.id, t.group_id, ROW_NUMBER() OVER (PARTITION BY t.group_id ORDER BY t.sort_order, t.id)
  FROM topics t JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE t.group_id IN (SELECT group_id FROM tmp_plan_groups) AND t.is_deleted = FALSE AND ts.code IN ('pending', 'scheduled');

  -- Una fecha por tema, ni mas ni menos.
  SELECT COUNT(*) INTO v_count FROM tmp_plan_topics tt LEFT JOIN tmp_plan_dates pd ON pd.group_id = tt.group_id AND pd.pos = tt.pos WHERE pd.d IS NULL;
  IF v_count > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'plan_incomplete';
  END IF;
  SELECT COUNT(*) INTO v_count FROM tmp_plan_dates pd JOIN holidays h ON h.tenant_id = v_tenant_id AND h.holiday_on = pd.d AND h.is_deleted = FALSE;
  IF v_count > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_is_holiday';
  END IF;

  SELECT v.id INTO v_scheduled_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'TOPIC_STATUS' AND v.code = 'scheduled';

  START TRANSACTION;
  UPDATE component_group_schedule_days d JOIN tmp_plan_groups pg ON pg.group_id = d.group_id
  SET d.is_deleted = TRUE, d.deleted_at = NOW(), d.deleted_by = p_actor_user_id
  WHERE d.is_deleted = FALSE;
  INSERT INTO component_group_schedule_days (group_id, weekday, start_time, end_time, created_by)
  SELECT pg.group_id, jt.weekday, jt.start_time, jt.end_time, p_actor_user_id
  FROM tmp_plan_groups pg,
       JSON_TABLE(pg.days, '$[*]' COLUMNS (weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) jt
  ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL;

  UPDATE topics t
  JOIN tmp_plan_topics tt ON tt.topic_id = t.id
  JOIN tmp_plan_dates pd ON pd.group_id = tt.group_id AND pd.pos = tt.pos
  SET t.scheduled_on = pd.d, t.status_id = v_scheduled_status_id, t.updated_at = NOW(), t.updated_by = p_actor_user_id;

  -- Cada fecha debe caer en un dia del horario semanal del grupo.
  SELECT COUNT(*) INTO v_count FROM tmp_plan_topics tt JOIN topics t ON t.id = tt.topic_id
  WHERE NOT EXISTS (SELECT 1 FROM component_group_schedule_days d
    WHERE d.group_id = t.group_id AND d.is_deleted = FALSE AND d.weekday = DAYOFWEEK(t.scheduled_on) - 1);
  IF v_count > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'plan_conflict';
  END IF;
  -- Un profesor no dicta dos clases el mismo dia (en ningun programa).
  SELECT COUNT(*) INTO v_count FROM tmp_plan_topics tt
  JOIN topics t ON t.id = tt.topic_id
  JOIN component_groups g ON g.id = t.group_id AND g.instructor_id IS NOT NULL
  JOIN component_groups g2 ON g2.instructor_id = g.instructor_id AND g2.is_deleted = FALSE
  JOIN components c2 ON c2.id = g2.component_id AND c2.is_deleted = FALSE
  JOIN training_programs p2 ON p2.id = c2.program_id AND p2.is_deleted = FALSE
  JOIN master_catalog_values ps2 ON ps2.id = p2.status_id AND ps2.code IN ('draft', 'active', 'paused')
  JOIN topics t2 ON t2.group_id = g2.id AND t2.is_deleted = FALSE AND t2.scheduled_on = t.scheduled_on AND t2.id <> t.id;
  IF v_count > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'plan_conflict';
  END IF;
  -- Dos componentes del programa no coinciden el mismo dia a la misma hora
  -- (los grupos de un mismo componente son alternativas y si pueden).
  SELECT COUNT(*) INTO v_count FROM tmp_plan_topics tt
  JOIN topics t ON t.id = tt.topic_id
  JOIN component_groups g ON g.id = t.group_id
  JOIN component_group_schedule_days d ON d.group_id = g.id AND d.is_deleted = FALSE AND d.weekday = DAYOFWEEK(t.scheduled_on) - 1
  JOIN topics t2 ON t2.scheduled_on = t.scheduled_on AND t2.is_deleted = FALSE AND t2.id <> t.id
  JOIN component_groups g2 ON g2.id = t2.group_id AND g2.is_deleted = FALSE AND g2.component_id <> g.component_id
  JOIN components c2 ON c2.id = g2.component_id AND c2.program_id = p_program_id AND c2.is_deleted = FALSE
  JOIN component_group_schedule_days d2 ON d2.group_id = g2.id AND d2.is_deleted = FALSE AND d2.weekday = d.weekday
  WHERE NOT (d.end_time <= d2.start_time OR d.start_time >= d2.end_time);
  IF v_count > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'plan_conflict';
  END IF;
  COMMIT;

  SELECT COUNT(*) AS topics_scheduled, COUNT(DISTINCT group_id) AS groups_scheduled FROM tmp_plan_topics;
  DROP TEMPORARY TABLE IF EXISTS tmp_plan_groups, tmp_plan_dates, tmp_plan_topics;
END$$

-- Grupos de un programa, en el orden de sus componentes, con su profesor,
-- horario actual y cuantos temas faltan programar (pendientes/programados).
CREATE PROCEDURE sp_schedule_planning_groups(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_program_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT p.id AS program_id, p.name AS program_name, p.tenant_id, p.starts_on AS program_starts_on,
         p.schedule_closed_at, cu.full_name AS schedule_closed_by_name,
         c.id AS component_id, c.name AS component_name, c.sort_order AS component_sort,
         g.id AS group_id, g.name AS group_name, g.instructor_id, iu.full_name AS instructor_name,
         (SELECT GROUP_CONCAT(CONCAT(d.weekday, '|', TIME_FORMAT(d.start_time, '%H:%i'), '|', TIME_FORMAT(d.end_time, '%H:%i')) ORDER BY d.weekday SEPARATOR ',')
            FROM component_group_schedule_days d WHERE d.group_id = g.id AND d.is_deleted = FALSE) AS schedule,
         (SELECT COUNT(*) FROM topics t JOIN master_catalog_values ts ON ts.id = t.status_id
            WHERE t.group_id = g.id AND t.is_deleted = FALSE AND ts.code IN ('pending', 'scheduled')) AS topics_to_plan,
         (SELECT COUNT(*) FROM topics t WHERE t.group_id = g.id AND t.is_deleted = FALSE) AS topics_total,
         (SELECT MIN(t.scheduled_on) FROM topics t WHERE t.group_id = g.id AND t.is_deleted = FALSE) AS first_date,
         (SELECT MAX(t.scheduled_on) FROM topics t WHERE t.group_id = g.id AND t.is_deleted = FALSE) AS last_date,
         (SELECT MAX(t.scheduled_on) FROM topics t JOIN master_catalog_values ts ON ts.id = t.status_id
            WHERE t.group_id = g.id AND t.is_deleted = FALSE AND ts.code NOT IN ('pending', 'scheduled')) AS last_fixed_date
  FROM training_programs p
  JOIN components c ON c.program_id = p.id AND c.is_deleted = FALSE
  JOIN component_groups g ON g.component_id = c.id AND g.is_deleted = FALSE
  LEFT JOIN users iu ON iu.id = g.instructor_id
  LEFT JOIN users cu ON cu.id = p.schedule_closed_by
  WHERE p.id = p_program_id
  ORDER BY c.sort_order, c.id, g.name, g.id;
END$$

-- Fechas en que los profesores de un programa ya dictan en OTROS programas
-- (el generador no les pone clase esos dias, igual que el SP de fechas).
CREATE PROCEDURE sp_schedule_busy_dates(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_program_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT DISTINCT g2.instructor_id, t2.scheduled_on
  FROM component_groups g
  JOIN components c ON c.id = g.component_id AND c.program_id = p_program_id
  JOIN component_groups g2 ON g2.instructor_id = g.instructor_id AND g2.is_deleted = FALSE
  JOIN components c2 ON c2.id = g2.component_id AND c2.program_id <> p_program_id AND c2.is_deleted = FALSE
  JOIN training_programs p2 ON p2.id = c2.program_id AND p2.is_deleted = FALSE
  JOIN master_catalog_values ps2 ON ps2.id = p2.status_id AND ps2.code IN ('draft', 'active', 'paused')
  JOIN topics t2 ON t2.group_id = g2.id AND t2.is_deleted = FALSE AND t2.scheduled_on IS NOT NULL
  WHERE g.is_deleted = FALSE AND g.instructor_id IS NOT NULL AND t2.scheduled_on >= DATE_SUB(CURDATE(), INTERVAL 30 DAY);
END$$

-- Reemplaza el horario semanal de un grupo con el que propone el generador.
-- No aplica la regla de "mismo dia y hora en otro grupo" de
-- sp_group_schedule_days_add: con componentes en secuencia un profesor
-- repite franja en meses distintos. El choque real (dos clases el mismo
-- dia) lo sigue impidiendo sp_topics_generate_schedule.
CREATE PROCEDURE sp_group_schedule_replace(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_group_id BIGINT UNSIGNED, IN p_days JSON
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  DECLARE v_bad INT;
  SELECT p.tenant_id INTO v_tenant_id
  FROM component_groups g JOIN components c ON c.id = g.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE g.id = p_group_id AND g.is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT COUNT(*) INTO v_bad
  FROM JSON_TABLE(COALESCE(p_days, JSON_ARRAY()), '$[*]' COLUMNS (
    weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) jt
  WHERE jt.weekday IS NULL OR jt.weekday < 0 OR jt.weekday > 6 OR jt.start_time IS NULL OR jt.end_time IS NULL OR jt.start_time >= jt.end_time;
  IF v_bad > 0 OR JSON_LENGTH(COALESCE(p_days, JSON_ARRAY())) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_schedule_day';
  END IF;

  UPDATE component_group_schedule_days SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id
  WHERE group_id = p_group_id AND is_deleted = FALSE;
  INSERT INTO component_group_schedule_days (group_id, weekday, start_time, end_time, created_by)
  SELECT p_group_id, jt.weekday, jt.start_time, jt.end_time, p_actor_user_id
  FROM JSON_TABLE(p_days, '$[*]' COLUMNS (weekday INT PATH '$.weekday', start_time TIME PATH '$.start', end_time TIME PATH '$.end')) jt
  ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL;
END$$

-- ===================================================================
-- Soporte. Ve un reporte quien lo creo, el admin de su tenant y el super
-- admin. Freno de abuso: maximo 20 reportes por usuario por dia.
CREATE PROCEDURE sp_support_tickets_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_type VARCHAR(20), IN p_title VARCHAR(140), IN p_description VARCHAR(2000), IN p_section VARCHAR(80),
  IN p_page_url VARCHAR(300), IN p_user_agent VARCHAR(300), IN p_viewport VARCHAR(30),
  IN p_screenshot_path VARCHAR(255), IN p_image_path VARCHAR(255)
)
BEGIN
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_today INT;
  IF p_type NOT IN ('incident', 'observation', 'improvement') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_ticket_type';
  END IF;
  IF CHAR_LENGTH(TRIM(COALESCE(p_title, ''))) = 0 OR CHAR_LENGTH(TRIM(COALESCE(p_description, ''))) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'reason_required';
  END IF;
  SELECT COUNT(*) INTO v_today FROM support_tickets WHERE reporter_id = p_actor_user_id AND created_at >= CURDATE();
  IF v_today >= 20 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'too_many_requests';
  END IF;

  INSERT INTO support_tickets (tenant_id, reporter_id, ticket_type, title, description, section, page_url, user_agent, viewport, screenshot_path, image_path)
  VALUES (p_actor_tenant_id, p_actor_user_id, p_type, TRIM(p_title), TRIM(p_description), p_section, p_page_url, p_user_agent, p_viewport, p_screenshot_path, p_image_path);
  SET v_id = LAST_INSERT_ID();

  -- Avisa a los admins del tenant (si quien reporta no lo es) y a los super admin.
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT p_actor_tenant_id,
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_TYPE' AND v.code = 'support_ticket'),
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_PRIORITY' AND v.code = IF(p_type = 'incident', 'high', 'medium')),
         au.id,
         LEFT(CONCAT(CASE p_type WHEN 'incident' THEN 'Incidencia' WHEN 'observation' THEN 'Observación' ELSE 'Mejora' END, ' de ', ru.full_name, ': ', TRIM(p_title)), 200),
         LEFT(CONCAT(COALESCE(CONCAT('En ', p_section, ' — '), ''), TRIM(p_description)), 1000),
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_STATUS' AND v.code = 'open'),
         'support_ticket', v_id, p_actor_user_id
  FROM users au
  JOIN master_catalog_values ar ON ar.id = au.role_id
  JOIN users ru ON ru.id = p_actor_user_id
  WHERE au.is_deleted = FALSE AND au.is_active = TRUE AND au.id <> p_actor_user_id
    AND (ar.code = 'super_admin' OR (ar.code = 'tenant_admin' AND au.tenant_id <=> p_actor_tenant_id AND p_actor_role <> 'tenant_admin'));
  SELECT v_id AS ticket_id;
END$$

CREATE PROCEDURE sp_support_tickets_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  SELECT st.id, st.ticket_type, st.title, st.description, st.section, st.status, st.created_at, st.updated_at,
         st.reporter_id, ru.full_name AS reporter_name, rr.code AS reporter_role, rr.label AS reporter_role_label,
         t.name AS tenant_name, st.screenshot_path IS NOT NULL AS has_screenshot, st.image_path IS NOT NULL AS has_image,
         (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = st.id) AS replies,
         (SELECT MAX(m.created_at) FROM support_ticket_messages m WHERE m.ticket_id = st.id) AS last_reply_at
  FROM support_tickets st
  JOIN users ru ON ru.id = st.reporter_id
  JOIN master_catalog_values rr ON rr.id = ru.role_id
  LEFT JOIN tenants t ON t.id = st.tenant_id
  WHERE p_actor_role = 'super_admin'
     OR st.reporter_id = p_actor_user_id
     OR (p_actor_role = 'tenant_admin' AND st.tenant_id <=> p_actor_tenant_id)
  ORDER BY FIELD(st.status, 'open', 'in_progress', 'resolved', 'closed'), st.created_at DESC
  LIMIT 500;
END$$

CREATE PROCEDURE sp_support_ticket_get(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_ticket_id BIGINT UNSIGNED
)
BEGIN
  SELECT st.*, ru.full_name AS reporter_name, ru.email AS reporter_email, rr.label AS reporter_role_label, t.name AS tenant_name
  FROM support_tickets st
  JOIN users ru ON ru.id = st.reporter_id
  JOIN master_catalog_values rr ON rr.id = ru.role_id
  LEFT JOIN tenants t ON t.id = st.tenant_id
  WHERE st.id = p_ticket_id
    AND (p_actor_role = 'super_admin' OR st.reporter_id = p_actor_user_id OR (p_actor_role = 'tenant_admin' AND st.tenant_id <=> p_actor_tenant_id));
END$$

CREATE PROCEDURE sp_support_ticket_messages(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_ticket_id BIGINT UNSIGNED
)
BEGIN
  SELECT m.id, m.message, m.created_at, m.author_id, au.full_name AS author_name, ar.code AS author_role, ar.label AS author_role_label
  FROM support_ticket_messages m
  JOIN support_tickets st ON st.id = m.ticket_id
  JOIN users au ON au.id = m.author_id
  JOIN master_catalog_values ar ON ar.id = au.role_id
  WHERE m.ticket_id = p_ticket_id
    AND (p_actor_role = 'super_admin' OR st.reporter_id = p_actor_user_id OR (p_actor_role = 'tenant_admin' AND st.tenant_id <=> p_actor_tenant_id))
  ORDER BY m.created_at, m.id;
END$$

-- Responde quien atiende (admin/super admin) o quien reporto. La respuesta
-- de un admin le llega como alerta a quien reporto, y la de quien reporto
-- a los que atienden.
CREATE PROCEDURE sp_support_ticket_reply(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_ticket_id BIGINT UNSIGNED, IN p_message VARCHAR(2000)
)
BEGIN
  DECLARE v_reporter BIGINT UNSIGNED;
  DECLARE v_tenant BIGINT UNSIGNED;
  DECLARE v_title VARCHAR(140);
  DECLARE v_status VARCHAR(20);
  DECLARE v_reporter_role VARCHAR(80);
  SELECT st.reporter_id, st.tenant_id, st.title, st.status, rr.code INTO v_reporter, v_tenant, v_title, v_status, v_reporter_role
  FROM support_tickets st JOIN users ru ON ru.id = st.reporter_id JOIN master_catalog_values rr ON rr.id = ru.role_id
  WHERE st.id = p_ticket_id;
  IF v_reporter IS NULL OR NOT (p_actor_role = 'super_admin' OR v_reporter = p_actor_user_id OR (p_actor_role = 'tenant_admin' AND v_tenant <=> p_actor_tenant_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF CHAR_LENGTH(TRIM(COALESCE(p_message, ''))) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'reason_required';
  END IF;
  INSERT INTO support_ticket_messages (ticket_id, author_id, message) VALUES (p_ticket_id, p_actor_user_id, TRIM(p_message));
  -- Si responde quien atiende y estaba abierto, pasa a "en atencion".
  IF v_reporter <> p_actor_user_id AND v_status = 'open' THEN
    UPDATE support_tickets SET status = 'in_progress', updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_ticket_id;
  ELSE
    UPDATE support_tickets SET updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_ticket_id;
  END IF;

  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT v_tenant,
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_TYPE' AND v.code = 'support_ticket'),
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_PRIORITY' AND v.code = 'medium'),
         u.id,
         LEFT(CONCAT(au.full_name, ' respondió: ', v_title), 200),
         LEFT(TRIM(p_message), 1000),
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_STATUS' AND v.code = 'open'),
         'support_ticket', p_ticket_id, p_actor_user_id
  FROM users u
  JOIN master_catalog_values r ON r.id = u.role_id
  JOIN users au ON au.id = p_actor_user_id
  WHERE u.is_deleted = FALSE AND u.is_active = TRUE AND u.id <> p_actor_user_id
    AND ((p_actor_user_id <> v_reporter AND u.id = v_reporter)
      OR (p_actor_user_id = v_reporter AND (r.code = 'super_admin' OR (r.code = 'tenant_admin' AND u.tenant_id <=> v_tenant AND v_reporter_role <> 'tenant_admin'))));
END$$

CREATE PROCEDURE sp_support_ticket_set_status(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_ticket_id BIGINT UNSIGNED, IN p_status VARCHAR(20)
)
BEGIN
  DECLARE v_tenant BIGINT UNSIGNED;
  DECLARE v_found INT;
  IF p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;
  SELECT COUNT(*), MAX(tenant_id) INTO v_found, v_tenant FROM support_tickets WHERE id = p_ticket_id;
  IF v_found = 0 OR NOT (p_actor_role = 'super_admin' OR (p_actor_role = 'tenant_admin' AND v_tenant <=> p_actor_tenant_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  UPDATE support_tickets SET status = p_status, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_ticket_id;
END$$

-- ===================================================================
-- Reportes con IA (solo admins).
CREATE PROCEDURE sp_ai_reports_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_title VARCHAR(200), IN p_filters JSON, IN p_model VARCHAR(80), IN p_comments_count INT, IN p_content JSON
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  INSERT INTO ai_reports (tenant_id, title, filters, model, comments_count, content, created_by)
  VALUES (p_actor_tenant_id, LEFT(p_title, 200), p_filters, p_model, p_comments_count, p_content, p_actor_user_id);
  SELECT LAST_INSERT_ID() AS report_id;
END$$

CREATE PROCEDURE sp_ai_reports_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT r.id, r.title, r.filters, r.model, r.comments_count, r.created_at, u.full_name AS created_by_name
  FROM ai_reports r LEFT JOIN users u ON u.id = r.created_by
  WHERE p_actor_role = 'super_admin' OR r.tenant_id <=> p_actor_tenant_id
  ORDER BY r.created_at DESC
  LIMIT 100;
END$$

CREATE PROCEDURE sp_ai_reports_get(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_report_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT r.*, u.full_name AS created_by_name
  FROM ai_reports r LEFT JOIN users u ON u.id = r.created_by
  WHERE r.id = p_report_id AND (p_actor_role = 'super_admin' OR r.tenant_id <=> p_actor_tenant_id);
END$$

CREATE PROCEDURE sp_onboarding_get(IN p_actor_user_id BIGINT UNSIGNED)
BEGIN
  SELECT onboarding_done_at FROM users WHERE id = p_actor_user_id;
END$$

-- p_done = FALSE vuelve a mostrar la guia en el proximo ingreso.
CREATE PROCEDURE sp_onboarding_set(IN p_actor_user_id BIGINT UNSIGNED, IN p_done BOOLEAN)
BEGIN
  UPDATE users SET onboarding_done_at = IF(p_done, NOW(), NULL) WHERE id = p_actor_user_id;
END$$

-- ===================================================================
-- Clase en linea y materiales. Acceso a una clase: 'edit' para su profesor
-- y el admin del tenant (o super admin); 'view' para sus alumnos.
CREATE PROCEDURE sp_class_access(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_topic_id BIGINT UNSIGNED
)
BEGIN
  SELECT t.id AS topic_id, g.id AS group_id, p.tenant_id,
         CASE
           WHEN p_actor_role = 'super_admin' THEN 'edit'
           WHEN p_actor_role = 'tenant_admin' AND p.tenant_id <=> p_actor_tenant_id THEN 'edit'
           WHEN p_actor_role = 'instructor' AND g.instructor_id = p_actor_user_id THEN 'edit'
           WHEN p_actor_role = 'student' AND EXISTS (SELECT 1 FROM group_enrollments ge WHERE ge.group_id = g.id AND ge.student_id = p_actor_user_id AND ge.is_deleted = FALSE) THEN 'view'
           ELSE 'none'
         END AS access
  FROM topics t
  JOIN component_groups g ON g.id = t.group_id AND g.is_deleted = FALSE
  JOIN components c ON c.id = g.component_id
  JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;
END$$

CREATE PROCEDURE sp_topic_class_get(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_topic_id BIGINT UNSIGNED
)
BEGIN
  SELECT t.id AS topic_id, t.title, t.scheduled_on, t.meeting_url AS topic_meeting_url, g.meeting_url AS group_meeting_url,
         COALESCE(NULLIF(t.meeting_url, ''), g.meeting_url) AS meeting_url, t.recording_url, t.class_notes, g.id AS group_id, g.name AS group_name
  FROM topics t JOIN component_groups g ON g.id = t.group_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;
END$$

-- p_meeting_url NULL/'' = la clase usa el link del grupo.
CREATE PROCEDURE sp_topic_class_info_set(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_topic_id BIGINT UNSIGNED,
  IN p_meeting_url VARCHAR(500), IN p_recording_url VARCHAR(500), IN p_class_notes VARCHAR(2000)
)
BEGIN
  UPDATE topics
  SET meeting_url = NULLIF(TRIM(p_meeting_url), ''), recording_url = NULLIF(TRIM(p_recording_url), ''),
      class_notes = NULLIF(TRIM(p_class_notes), ''), updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_topic_id;
END$$

-- Link del grupo; con p_apply_all las clases futuras del grupo dejan su
-- link propio y pasan a usar este.
CREATE PROCEDURE sp_group_meeting_set(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_group_id BIGINT UNSIGNED, IN p_meeting_url VARCHAR(500), IN p_apply_all BOOLEAN
)
BEGIN
  UPDATE component_groups SET meeting_url = NULLIF(TRIM(p_meeting_url), ''), updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_group_id;
  IF p_apply_all THEN
    UPDATE topics SET meeting_url = NULL, updated_at = NOW(), updated_by = p_actor_user_id
    WHERE group_id = p_group_id AND is_deleted = FALSE AND (scheduled_on IS NULL OR scheduled_on >= CURDATE());
  END IF;
END$$

CREATE PROCEDURE sp_topic_resources_list(IN p_topic_id BIGINT UNSIGNED)
BEGIN
  SELECT r.id, r.kind, r.title, r.url, r.original_name, r.size_bytes, r.mime_type, r.created_at, u.full_name AS created_by_name
  FROM topic_resources r LEFT JOIN users u ON u.id = r.created_by
  WHERE r.topic_id = p_topic_id AND r.is_deleted = FALSE
  ORDER BY r.created_at, r.id;
END$$

CREATE PROCEDURE sp_topic_resources_add(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_topic_id BIGINT UNSIGNED, IN p_kind VARCHAR(10), IN p_title VARCHAR(200),
  IN p_url VARCHAR(500), IN p_file_path VARCHAR(255), IN p_original_name VARCHAR(255), IN p_size_bytes INT UNSIGNED, IN p_mime_type VARCHAR(120)
)
BEGIN
  IF (SELECT COUNT(*) FROM topic_resources WHERE topic_id = p_topic_id AND is_deleted = FALSE) >= 30 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'too_many_resources';
  END IF;
  INSERT INTO topic_resources (topic_id, kind, title, url, file_path, original_name, size_bytes, mime_type, created_by)
  VALUES (p_topic_id, p_kind, LEFT(TRIM(p_title), 200), p_url, p_file_path, p_original_name, p_size_bytes, p_mime_type, p_actor_user_id);
  SELECT LAST_INSERT_ID() AS resource_id;
END$$

CREATE PROCEDURE sp_topic_resource_get(IN p_resource_id BIGINT UNSIGNED)
BEGIN
  SELECT id, topic_id, kind, file_path, original_name, mime_type FROM topic_resources WHERE id = p_resource_id AND is_deleted = FALSE;
END$$

CREATE PROCEDURE sp_topic_resources_remove(IN p_actor_user_id BIGINT UNSIGNED, IN p_resource_id BIGINT UNSIGNED)
BEGIN
  UPDATE topic_resources SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id WHERE id = p_resource_id;
END$$

-- ===================================================================
-- Trabajos de generacion de material con IA (los ejecuta el servidor en
-- segundo plano; ver server/materialJobs.js).
CREATE PROCEDURE sp_material_jobs_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED, IN p_topics JSON, IN p_options JSON, IN p_total INT, IN p_model VARCHAR(80)
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  SELECT p.tenant_id INTO v_tenant_id FROM components c JOIN training_programs p ON p.id = c.program_id
  WHERE c.id = p_component_id AND c.is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND NOT (v_tenant_id <=> p_actor_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF EXISTS (SELECT 1 FROM material_jobs WHERE component_id = p_component_id AND status IN ('queued', 'running')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material_job_running';
  END IF;
  INSERT INTO material_jobs (tenant_id, component_id, status, topics, options, total, model, created_by)
  VALUES (v_tenant_id, p_component_id, 'queued', p_topics, p_options, p_total, p_model, p_actor_user_id);
  SELECT LAST_INSERT_ID() AS job_id;
END$$

CREATE PROCEDURE sp_material_jobs_progress(
  IN p_job_id BIGINT UNSIGNED, IN p_status VARCHAR(20), IN p_topics JSON, IN p_done INT, IN p_failed INT
)
BEGIN
  UPDATE material_jobs
  SET status = p_status, topics = p_topics, done_count = p_done, failed_count = p_failed,
      started_at = COALESCE(started_at, NOW()), updated_at = NOW()
  WHERE id = p_job_id;
END$$

-- Cierra el trabajo y avisa a quien lo pidio (alerta con el resultado).
CREATE PROCEDURE sp_material_jobs_finish(
  IN p_job_id BIGINT UNSIGNED, IN p_status VARCHAR(20), IN p_topics JSON, IN p_done INT, IN p_failed INT, IN p_error VARCHAR(500)
)
BEGIN
  UPDATE material_jobs
  SET status = p_status, topics = p_topics, done_count = p_done, failed_count = p_failed,
      error = p_error, finished_at = NOW()
  WHERE id = p_job_id;
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT j.tenant_id,
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_TYPE' AND v.code = 'material_ready'),
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_PRIORITY' AND v.code = IF(p_status = 'done', 'low', 'medium')),
         j.created_by,
         LEFT(CONCAT(IF(p_status = 'done', '✓ Material listo: ', IF(p_status = 'partial', 'Material generado en parte: ', 'No se pudo generar el material: ')), co.name), 200),
         LEFT(CONCAT(p_done, ' de ', j.total, ' tema(s) generados con IA', IF(p_failed > 0, CONCAT(' · ', p_failed, ' con error (puedes reintentarlos)'), ''), IF(p_error IS NULL, '', CONCAT(' — ', p_error))), 1000),
         (SELECT v.id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ALERT_STATUS' AND v.code = 'open'),
         'material_job', j.id, j.created_by
  FROM material_jobs j JOIN components co ON co.id = j.component_id
  WHERE j.id = p_job_id AND j.created_by IS NOT NULL;
END$$

CREATE PROCEDURE sp_material_jobs_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_component_id BIGINT UNSIGNED
)
BEGIN
  IF p_actor_role NOT IN ('tenant_admin', 'super_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  SELECT j.id, j.component_id, co.name AS component_name, p.name AS program_name, j.status, j.topics, j.total,
         j.done_count, j.failed_count, j.model, j.error, j.created_at, j.started_at, j.finished_at, u.full_name AS created_by_name
  FROM material_jobs j
  JOIN components co ON co.id = j.component_id
  JOIN training_programs p ON p.id = co.program_id
  LEFT JOIN users u ON u.id = j.created_by
  WHERE (p_component_id IS NULL OR j.component_id = p_component_id)
    AND (p_actor_role = 'super_admin' OR j.tenant_id <=> p_actor_tenant_id)
  ORDER BY j.created_at DESC, j.id DESC
  LIMIT 30;
END$$

CREATE PROCEDURE sp_material_jobs_get(IN p_job_id BIGINT UNSIGNED)
BEGIN
  SELECT j.*, u.role_id, r.code AS created_by_role, u.tenant_id AS created_by_tenant
  FROM material_jobs j LEFT JOIN users u ON u.id = j.created_by LEFT JOIN master_catalog_values r ON r.id = u.role_id
  WHERE j.id = p_job_id;
END$$

-- Trabajos sin avance hace 15 minutos (el servidor que los ejecutaba se
-- reinicio) quedan como interrumpidos; se pueden reintentar. Por tiempo y no
-- al arrancar: staging y local pueden compartir la base.
CREATE PROCEDURE sp_material_jobs_interrupt()
BEGIN
  UPDATE material_jobs SET status = 'interrupted', finished_at = NOW(), error = 'El servidor se reinició durante la generación'
  WHERE status IN ('queued', 'running') AND COALESCE(updated_at, created_at) < DATE_SUB(NOW(), INTERVAL 15 MINUTE);
END$$

-- ===================================================================
-- Induccion: pasos a ritmo propio y su avance por alumno.
CREATE PROCEDURE sp_programs_set_type(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_program_type VARCHAR(20), IN p_sequential BOOLEAN
)
BEGIN
  DECLARE v_tenant_id BIGINT UNSIGNED;
  SELECT tenant_id INTO v_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
  END IF;
  IF p_actor_role = 'tenant_admin' AND v_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  ELSEIF p_actor_role NOT IN ('super_admin', 'tenant_admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;
  IF p_program_type NOT IN ('training', 'induction') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_status';
  END IF;
  UPDATE training_programs SET program_type = p_program_type, sequential = COALESCE(p_sequential, TRUE), updated_at = NOW(), updated_by = p_actor_user_id
  WHERE id = p_program_id;
END$$

-- 'edit' admin del tenant (o super admin), 'view' alumno inscrito, 'none'.
CREATE PROCEDURE sp_induction_access(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED, IN p_program_id BIGINT UNSIGNED
)
BEGIN
  SELECT p.id AS program_id, p.name, p.description, p.cohort, p.sequential, p.program_type, p.tenant_id,
         p.color_primary, p.color_accent, tn.brand_color AS tenant_brand_color,
         CASE
           WHEN p_actor_role = 'super_admin' THEN 'edit'
           WHEN p_actor_role = 'tenant_admin' AND p.tenant_id <=> p_actor_tenant_id THEN 'edit'
           WHEN p_actor_role = 'student' AND EXISTS (SELECT 1 FROM program_enrollments pe WHERE pe.program_id = p.id AND pe.student_id = p_actor_user_id AND pe.is_deleted = FALSE) THEN 'view'
           ELSE 'none'
         END AS access
  FROM training_programs p JOIN tenants tn ON tn.id = p.tenant_id
  WHERE p.id = p_program_id AND p.is_deleted = FALSE;
END$$

-- Programas de induccion visibles: los del tenant (admin) o en los que el
-- alumno esta inscrito.
CREATE PROCEDURE sp_induction_programs(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  SELECT p.id, p.name, p.cohort, p.description, p.sequential, p.starts_on, p.ends_on, tn.name AS tenant_name,
         (SELECT COUNT(*) FROM program_enrollments pe WHERE pe.program_id = p.id AND pe.is_deleted = FALSE) AS enrolled
  FROM training_programs p JOIN tenants tn ON tn.id = p.tenant_id
  WHERE p.is_deleted = FALSE AND p.program_type = 'induction'
    AND (p_actor_role = 'super_admin'
      OR (p_actor_role = 'tenant_admin' AND p.tenant_id <=> p_actor_tenant_id)
      OR (p_actor_role = 'student' AND EXISTS (SELECT 1 FROM program_enrollments pe WHERE pe.program_id = p.id AND pe.student_id = p_actor_user_id AND pe.is_deleted = FALSE)))
  ORDER BY p.starts_on DESC, p.name;
END$$

-- Etapas (componentes) y sus pasos, en orden. Etapas sin pasos tambien.
CREATE PROCEDURE sp_induction_steps_list(IN p_program_id BIGINT UNSIGNED)
BEGIN
  SELECT c.id AS component_id, c.name AS component_name, c.description AS component_description, c.sort_order,
         s.id AS step_id, s.position, s.step_type, s.title, s.description, s.url, s.required, s.min_score, s.quiz, s.est_minutes, s.scheduled_at
  FROM components c
  LEFT JOIN induction_steps s ON s.component_id = c.id AND s.is_deleted = FALSE
  WHERE c.program_id = p_program_id AND c.is_deleted = FALSE
  ORDER BY c.sort_order, c.id, s.position, s.id;
END$$

-- Crea (p_step_id NULL) o actualiza un paso. Permisos los valida el servidor
-- con sp_induction_access sobre el programa del componente.
CREATE PROCEDURE sp_induction_step_save(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_step_id BIGINT UNSIGNED, IN p_component_id BIGINT UNSIGNED,
  IN p_step_type VARCHAR(20), IN p_title VARCHAR(200), IN p_description VARCHAR(2000), IN p_url VARCHAR(500),
  IN p_required BOOLEAN, IN p_min_score TINYINT UNSIGNED, IN p_quiz JSON, IN p_est_minutes SMALLINT UNSIGNED, IN p_position INT,
  IN p_scheduled_at DATETIME
)
BEGIN
  IF p_step_id IS NULL THEN
    INSERT INTO induction_steps (component_id, position, step_type, title, description, url, required, min_score, quiz, est_minutes, scheduled_at, created_by)
    VALUES (p_component_id,
            COALESCE(p_position, (SELECT COALESCE(MAX(s.position), 0) + 1 FROM induction_steps s WHERE s.component_id = p_component_id AND s.is_deleted = FALSE)),
            p_step_type, TRIM(p_title), NULLIF(TRIM(p_description), ''), NULLIF(TRIM(p_url), ''), p_required, p_min_score, p_quiz, p_est_minutes, p_scheduled_at, p_actor_user_id);
    SELECT LAST_INSERT_ID() AS step_id;
  ELSE
    UPDATE induction_steps
    SET step_type = p_step_type, title = TRIM(p_title), description = NULLIF(TRIM(p_description), ''), url = NULLIF(TRIM(p_url), ''),
        required = p_required, min_score = p_min_score, quiz = p_quiz, est_minutes = p_est_minutes, scheduled_at = p_scheduled_at,
        position = COALESCE(p_position, position), updated_at = NOW(), updated_by = p_actor_user_id
    WHERE id = p_step_id;
    SELECT p_step_id AS step_id;
  END IF;
END$$

CREATE PROCEDURE sp_induction_step_get(IN p_step_id BIGINT UNSIGNED)
BEGIN
  SELECT s.*, c.program_id FROM induction_steps s JOIN components c ON c.id = s.component_id
  WHERE s.id = p_step_id AND s.is_deleted = FALSE;
END$$

CREATE PROCEDURE sp_induction_step_remove(IN p_actor_user_id BIGINT UNSIGNED, IN p_step_id BIGINT UNSIGNED)
BEGIN
  UPDATE induction_steps SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id WHERE id = p_step_id;
END$$

-- Avance: de un alumno (p_student_id) o de todos los inscritos (NULL).
CREATE PROCEDURE sp_induction_progress_list(IN p_program_id BIGINT UNSIGNED, IN p_student_id BIGINT UNSIGNED)
BEGIN
  SELECT ip.step_id, ip.student_id, ip.status, ip.score, ip.last_score, ip.attempts, ip.answers, ip.started_at, ip.completed_at, ip.updated_at
  FROM induction_progress ip
  JOIN induction_steps s ON s.id = ip.step_id AND s.is_deleted = FALSE
  JOIN components c ON c.id = s.component_id AND c.program_id = p_program_id
  WHERE p_student_id IS NULL OR ip.student_id = p_student_id;
END$$

-- Registra un avance. Para cuestionarios guarda la mejor nota; un paso ya
-- completado no vuelve atras.
CREATE PROCEDURE sp_induction_progress_set(
  IN p_step_id BIGINT UNSIGNED, IN p_student_id BIGINT UNSIGNED, IN p_status VARCHAR(20), IN p_score DECIMAL(5,2), IN p_answers JSON
)
BEGIN
  INSERT INTO induction_progress (step_id, student_id, status, score, last_score, attempts, answers, completed_at, updated_at)
  VALUES (p_step_id, p_student_id, p_status, p_score, p_score, IF(p_score IS NULL, 0, 1), p_answers, IF(p_status = 'completed', NOW(), NULL), NOW())
  ON DUPLICATE KEY UPDATE
    status = IF(status = 'completed', 'completed', VALUES(status)),
    score = IF(VALUES(score) IS NULL, score, GREATEST(COALESCE(score, 0), VALUES(score))),
    last_score = COALESCE(VALUES(last_score), last_score),
    attempts = attempts + IF(VALUES(score) IS NULL, 0, 1),
    answers = COALESCE(VALUES(answers), answers),
    completed_at = IF(completed_at IS NULL AND VALUES(status) = 'completed', NOW(), completed_at),
    updated_at = NOW();
END$$

-- Inscritos de un programa (para el tablero de induccion).
CREATE PROCEDURE sp_induction_students(IN p_program_id BIGINT UNSIGNED)
BEGIN
  SELECT u.id, u.full_name, u.email, u.photo_path, u.is_active, pe.created_at AS enrolled_at
  FROM program_enrollments pe JOIN users u ON u.id = pe.student_id AND u.is_deleted = FALSE
  WHERE pe.program_id = p_program_id AND pe.is_deleted = FALSE
  ORDER BY u.full_name;
END$$

CREATE PROCEDURE sp_dashboard_get(IN p_user_id BIGINT, IN p_role VARCHAR(80), IN p_tenant_id BIGINT)
BEGIN
  SELECT p_role AS role_code, p_user_id AS user_id, p_tenant_id AS tenant_id;
END$$

DELIMITER ;