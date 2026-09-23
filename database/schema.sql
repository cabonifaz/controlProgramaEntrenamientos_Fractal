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

-- Horario base del programa: dias de la semana (0=domingo..6=sabado, estilo
-- Date.getDay() de JS) y franja horaria en que se dictan clases. El generador
-- automatico de fechas de temas solo usa estos dias.
CREATE TABLE IF NOT EXISTS program_schedule_days (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_program_weekday (program_id, weekday),
  CONSTRAINT fk_schedule_day_program FOREIGN KEY (program_id) REFERENCES training_programs(id),
  CONSTRAINT chk_schedule_day_weekday CHECK (weekday BETWEEN 0 AND 6)
);

CREATE TABLE IF NOT EXISTS components (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  instructor_id BIGINT UNSIGNED NULL,
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
  CONSTRAINT fk_component_instructor FOREIGN KEY (instructor_id) REFERENCES users(id),
  CONSTRAINT fk_component_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id)
);

CREATE TABLE IF NOT EXISTS component_enrollments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  component_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_component_student (component_id, student_id),
  CONSTRAINT fk_component_enrollment_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT fk_component_enrollment_student FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS topics (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  component_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  scheduled_on DATE NULL,
  actual_date DATE NULL,
  duration_minutes INT UNSIGNED NULL,
  instructor_id BIGINT UNSIGNED NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_topic_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT fk_topic_status FOREIGN KEY (status_id) REFERENCES master_catalog_values(id),
  CONSTRAINT fk_topic_instructor FOREIGN KEY (instructor_id) REFERENCES users(id)
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
  ('ALERT_STATUS', 'Estados de alerta', 'Estado de lectura de una alerta');

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
  ((SELECT id FROM master_catalogs WHERE code = 'ALERT_STATUS'), 'read', 'Leida', 2);

-- ===================================================================
-- Procedimientos almacenados
-- ===================================================================
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
DROP PROCEDURE IF EXISTS sp_components_assign_instructor;
DROP PROCEDURE IF EXISTS sp_components_enroll_student;
DROP PROCEDURE IF EXISTS sp_topics_list;
DROP PROCEDURE IF EXISTS sp_topics_create;
DROP PROCEDURE IF EXISTS sp_topics_update_status;
DROP PROCEDURE IF EXISTS sp_topics_reschedule;
DROP PROCEDURE IF EXISTS sp_topics_generate_schedule;
DROP PROCEDURE IF EXISTS sp_program_schedule_days_list;
DROP PROCEDURE IF EXISTS sp_program_schedule_days_add;
DROP PROCEDURE IF EXISTS sp_program_schedule_days_remove;
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
DROP PROCEDURE IF EXISTS sp_components_list_by_instructor;
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
DROP PROCEDURE IF EXISTS sp_instructor_metrics;
DROP PROCEDURE IF EXISTS sp_dashboard_get;
DROP PROCEDURE IF EXISTS sp_attendance_record;

DELIMITER $$

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

  SELECT t.id, t.name, t.slug, t.contact_name, t.contact_email, t.timezone,
         ts.code AS status_code, ts.label AS status_label, t.created_at
  FROM tenants t
  JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE t.is_deleted = FALSE
  ORDER BY t.name;
END$$

CREATE PROCEDURE sp_tenants_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80),
  IN p_name VARCHAR(160), IN p_slug VARCHAR(80),
  IN p_contact_name VARCHAR(160), IN p_contact_email VARCHAR(190), IN p_timezone VARCHAR(60)
)
BEGIN
  DECLARE v_status_id BIGINT UNSIGNED;

  IF p_actor_role <> 'super_admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF EXISTS (SELECT 1 FROM tenants WHERE slug = p_slug AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'slug_already_exists';
  END IF;

  SELECT v.id INTO v_status_id
  FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'TENANT_STATUS' AND v.code = 'active';

  INSERT INTO tenants (name, slug, contact_name, contact_email, timezone, status_id, created_by)
  VALUES (p_name, p_slug, p_contact_name, p_contact_email, COALESCE(NULLIF(p_timezone, ''), 'America/Lima'), v_status_id, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS tenant_id;
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

  SELECT u.id, u.tenant_id, u.full_name, u.email, v.code AS role_code, u.is_active, u.must_change_password, u.created_at
  FROM users u
  JOIN master_catalog_values v ON v.id = u.role_id
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
         pm.code AS modality_code, pm.label AS modality_label, p.created_at
  FROM training_programs p
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

  IF v_student_role IS NULL OR v_student_role <> 'student' OR v_student_tenant_id <> v_program_tenant_id THEN
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

  SELECT c.id, c.program_id, c.name, c.description, c.sort_order, c.instructor_id,
         iu.full_name AS instructor_name, cs.code AS status_code, cs.label AS status_label
  FROM components c
  JOIN master_catalog_values cs ON cs.id = c.status_id
  LEFT JOIN users iu ON iu.id = c.instructor_id
  WHERE c.program_id = p_program_id AND c.is_deleted = FALSE
  ORDER BY c.sort_order, c.name;
END$$

CREATE PROCEDURE sp_components_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_name VARCHAR(180), IN p_description TEXT,
  IN p_sort_order INT, IN p_instructor_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_instructor_tenant_id BIGINT UNSIGNED;
  DECLARE v_instructor_role VARCHAR(80);

  SELECT tenant_id INTO v_program_tenant_id FROM training_programs WHERE id = p_program_id AND is_deleted = FALSE;
  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'program_not_found';
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
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'COMPONENT_STATUS' AND v.code = 'pending';

  INSERT INTO components (program_id, instructor_id, name, description, sort_order, status_id, created_by)
  VALUES (p_program_id, p_instructor_id, p_name, p_description, COALESCE(p_sort_order, 0), v_status_id, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS component_id;
END$$

CREATE PROCEDURE sp_components_assign_instructor(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED, IN p_instructor_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
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

  SELECT u.tenant_id, v.code INTO v_instructor_tenant_id, v_instructor_role
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id
  WHERE u.id = p_instructor_id AND u.is_deleted = FALSE;

  IF v_instructor_role IS NULL OR v_instructor_role <> 'instructor' OR v_instructor_tenant_id <> v_program_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'instructor_invalid';
  END IF;

  UPDATE components SET instructor_id = p_instructor_id, updated_at = NOW(), updated_by = p_actor_user_id WHERE id = p_component_id;
END$$

CREATE PROCEDURE sp_components_enroll_student(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED, IN p_student_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_program_id BIGINT UNSIGNED;
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_student_tenant_id BIGINT UNSIGNED;
  DECLARE v_student_role VARCHAR(80);

  SELECT c.program_id, p.tenant_id INTO v_program_id, v_program_tenant_id
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

  SELECT u.tenant_id, v.code INTO v_student_tenant_id, v_student_role
  FROM users u JOIN master_catalog_values v ON v.id = u.role_id
  WHERE u.id = p_student_id AND u.is_deleted = FALSE;

  IF v_student_role IS NULL OR v_student_role <> 'student' OR v_student_tenant_id <> v_program_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'student_invalid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM program_enrollments WHERE program_id = v_program_id AND student_id = p_student_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'student_not_enrolled_in_program';
  END IF;

  IF EXISTS (SELECT 1 FROM component_enrollments WHERE component_id = p_component_id AND student_id = p_student_id AND is_deleted = FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'already_enrolled';
  END IF;

  INSERT INTO component_enrollments (component_id, student_id, created_by) VALUES (p_component_id, p_student_id, p_actor_user_id);
END$$

CREATE PROCEDURE sp_topics_list(
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

  SELECT t.id, t.component_id, t.title, t.description, t.sort_order, t.scheduled_on, t.actual_date,
         t.duration_minutes, t.instructor_id, iu.full_name AS instructor_name,
         ts.code AS status_code, ts.label AS status_label
  FROM topics t
  JOIN master_catalog_values ts ON ts.id = t.status_id
  LEFT JOIN users iu ON iu.id = t.instructor_id
  WHERE t.component_id = p_component_id AND t.is_deleted = FALSE
  ORDER BY t.sort_order, t.scheduled_on;
END$$

-- La fecha propuesta no puede caer en un feriado activo del tenant: la regla
-- de calendario vive aqui, no en la API ni en el frontend.
CREATE PROCEDURE sp_topics_create(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED, IN p_title VARCHAR(180), IN p_description TEXT,
  IN p_sort_order INT, IN p_scheduled_on DATE, IN p_duration_minutes INT UNSIGNED
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_component_instructor_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;

  SELECT p.tenant_id, c.instructor_id INTO v_program_tenant_id, v_component_instructor_id
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

  IF p_scheduled_on IS NOT NULL AND EXISTS (
    SELECT 1 FROM holidays h WHERE h.tenant_id = v_program_tenant_id AND h.holiday_on = p_scheduled_on AND h.is_deleted = FALSE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_is_holiday';
  END IF;

  SELECT v.id INTO v_status_id FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id
  WHERE c.code = 'TOPIC_STATUS' AND v.code = IF(p_scheduled_on IS NULL, 'pending', 'scheduled');

  INSERT INTO topics (component_id, title, description, sort_order, scheduled_on, duration_minutes, instructor_id, status_id, created_by)
  VALUES (p_component_id, p_title, p_description, COALESCE(p_sort_order, 0), p_scheduled_on, p_duration_minutes, v_component_instructor_id, v_status_id, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS topic_id;
END$$

-- El instructor asignado al componente (o un admin de su tenant) puede
-- marcar el tema como iniciado/completado/adelantado y registrar la fecha real.
CREATE PROCEDURE sp_topics_update_status(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_topic_id BIGINT UNSIGNED, IN p_status_code VARCHAR(80), IN p_actual_date DATE
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_component_instructor_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_authorized BOOLEAN DEFAULT FALSE;

  SELECT p.tenant_id, c.instructor_id INTO v_program_tenant_id, v_component_instructor_id
  FROM topics t JOIN components c ON c.id = t.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;

  IF p_actor_role = 'instructor' AND p_actor_user_id = v_component_instructor_id THEN
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
-- Horario base del programa y generador automatico de fechas del temario.
-- Reglas de negocio (dias habiles del programa, feriados, disponibilidad del
-- instructor) resueltas por completo en SQL; la API solo dispara el SP.
-- ===================================================================
CREATE PROCEDURE sp_program_schedule_days_list(
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

  SELECT id, weekday, start_time, end_time
  FROM program_schedule_days
  WHERE program_id = p_program_id AND is_deleted = FALSE
  ORDER BY weekday;
END$$

CREATE PROCEDURE sp_program_schedule_days_add(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_weekday TINYINT UNSIGNED, IN p_start_time TIME, IN p_end_time TIME
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

  IF p_weekday IS NULL OR p_weekday > 6 OR p_start_time IS NULL OR p_end_time IS NULL OR p_start_time >= p_end_time THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid_schedule_day';
  END IF;

  INSERT INTO program_schedule_days (program_id, weekday, start_time, end_time, created_by)
  VALUES (p_program_id, p_weekday, p_start_time, p_end_time, p_actor_user_id)
  ON DUPLICATE KEY UPDATE start_time = p_start_time, end_time = p_end_time, is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL;
END$$

CREATE PROCEDURE sp_program_schedule_days_remove(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_program_id BIGINT UNSIGNED, IN p_weekday TINYINT UNSIGNED
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

  UPDATE program_schedule_days
  SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = p_actor_user_id
  WHERE program_id = p_program_id AND weekday = p_weekday;
END$$

-- Genera scheduled_on para los temas pendientes/programados de un componente,
-- en orden, saltando dias fuera del horario base del programa, feriados del
-- tenant y fechas donde el instructor ya tiene otro tema asignado. Los temas
-- ya iniciados/completados/cancelados no se tocan.
CREATE PROCEDURE sp_topics_generate_schedule(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_component_id BIGINT UNSIGNED, IN p_start_date DATE
)
BEGIN
  DECLARE v_program_id BIGINT UNSIGNED;
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
    WHERE t.component_id = p_component_id AND t.is_deleted = FALSE AND ts.code IN ('pending', 'scheduled')
    ORDER BY t.sort_order, t.id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_topic_done = TRUE;

  SELECT p.id, p.tenant_id, c.instructor_id INTO v_program_id, v_program_tenant_id, v_instructor_id
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

  SELECT COUNT(*) INTO v_schedule_day_count FROM program_schedule_days WHERE program_id = v_program_id AND is_deleted = FALSE;
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
           SELECT 1 FROM program_schedule_days
           WHERE program_id = v_program_id AND weekday = (DAYOFWEEK(v_cursor) - 1) AND is_deleted = FALSE
         )
         AND NOT EXISTS (
           SELECT 1 FROM holidays WHERE tenant_id = v_program_tenant_id AND holiday_on = v_cursor AND is_deleted = FALSE
         )
         AND (v_instructor_id IS NULL OR NOT EXISTS (
           SELECT 1 FROM topics t2 JOIN components c2 ON c2.id = t2.component_id
           WHERE c2.instructor_id = v_instructor_id AND t2.scheduled_on = v_cursor
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
-- nuevo sobre una fecha ya asignada). Respeta las mismas reglas de calendario.
CREATE PROCEDURE sp_topics_reschedule(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED,
  IN p_topic_id BIGINT UNSIGNED, IN p_new_date DATE
)
BEGIN
  DECLARE v_program_tenant_id BIGINT UNSIGNED;
  DECLARE v_instructor_id BIGINT UNSIGNED;
  DECLARE v_rescheduled_status_id BIGINT UNSIGNED;

  SELECT p.tenant_id, c.instructor_id INTO v_program_tenant_id, v_instructor_id
  FROM topics t JOIN components c ON c.id = t.component_id JOIN training_programs p ON p.id = c.program_id
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
    SELECT 1 FROM topics t2 JOIN components c2 ON c2.id = t2.component_id
    WHERE c2.instructor_id = v_instructor_id AND t2.scheduled_on = p_new_date AND t2.is_deleted = FALSE AND t2.id <> p_topic_id
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
    c.instructor_id,
    CONCAT('Tema atrasado: ', t.title),
    CONCAT('El tema "', t.title, '" del componente "', c.name, '" estaba programado para el ', t.scheduled_on, ' y sigue sin completarse.'),
    v_open_status_id, 'topic', t.id, p_actor_user_id
  FROM topics t
  JOIN components c ON c.id = t.component_id
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

  -- 2) Componentes activos sin instructor asignado.
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT p.tenant_id,
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_TYPE' AND v.code = 'program_without_instructor'),
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_PRIORITY' AND v.code = 'medium'),
    NULL,
    CONCAT('Componente sin instructor: ', c.name),
    CONCAT('El componente "', c.name, '" del programa "', p.name, '" no tiene instructor asignado.'),
    v_open_status_id, 'component', c.id, p_actor_user_id
  FROM components c
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values ps ON ps.id = p.status_id
  WHERE c.is_deleted = FALSE AND c.instructor_id IS NULL AND ps.code = 'active'
    AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
    AND NOT EXISTS (
      SELECT 1 FROM alerts a JOIN master_catalog_values ast ON ast.id = a.status_id
      JOIN master_catalog_values at2 ON at2.id = a.type_id
      WHERE a.source_type = 'component' AND a.source_id = c.id AND at2.code = 'program_without_instructor' AND ast.code = 'open' AND a.is_deleted = FALSE
    );

  -- 3) Componentes activos sin alumnos inscritos.
  INSERT INTO alerts (tenant_id, type_id, priority_id, recipient_user_id, title, description, status_id, source_type, source_id, created_by)
  SELECT p.tenant_id,
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_TYPE' AND v.code = 'component_without_students'),
    (SELECT v.id FROM master_catalog_values v JOIN master_catalogs mc ON mc.id = v.catalog_id WHERE mc.code = 'ALERT_PRIORITY' AND v.code = 'low'),
    NULL,
    CONCAT('Componente sin alumnos: ', c.name),
    CONCAT('El componente "', c.name, '" del programa "', p.name, '" no tiene alumnos inscritos.'),
    v_open_status_id, 'component', c.id, p_actor_user_id
  FROM components c
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values ps ON ps.id = p.status_id
  WHERE c.is_deleted = FALSE AND ps.code = 'active'
    AND NOT EXISTS (SELECT 1 FROM component_enrollments ce WHERE ce.component_id = c.id AND ce.is_deleted = FALSE)
    AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
    AND NOT EXISTS (
      SELECT 1 FROM alerts a JOIN master_catalog_values ast ON ast.id = a.status_id
      JOIN master_catalog_values at2 ON at2.id = a.type_id
      WHERE a.source_type = 'component' AND a.source_id = c.id AND at2.code = 'component_without_students' AND ast.code = 'open' AND a.is_deleted = FALSE
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
  DECLARE v_component_id BIGINT UNSIGNED;
  DECLARE v_component_instructor_id BIGINT UNSIGNED;
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_reason_id BIGINT UNSIGNED;
  DECLARE v_authorized BOOLEAN DEFAULT FALSE;

  SELECT p.tenant_id, c.id, c.instructor_id INTO v_program_tenant_id, v_component_id, v_component_instructor_id
  FROM topics t JOIN components c ON c.id = t.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;

  IF p_actor_role = 'instructor' AND p_actor_user_id = v_component_instructor_id THEN
    SET v_authorized = TRUE;
  ELSEIF p_actor_role = 'tenant_admin' AND v_program_tenant_id = p_actor_tenant_id THEN
    SET v_authorized = TRUE;
  ELSEIF p_actor_role = 'super_admin' THEN
    SET v_authorized = TRUE;
  END IF;
  IF NOT v_authorized THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM component_enrollments WHERE component_id = v_component_id AND student_id = p_student_id AND is_deleted = FALSE) THEN
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
  DECLARE v_component_instructor_id BIGINT UNSIGNED;

  SELECT p.tenant_id, c.instructor_id INTO v_program_tenant_id, v_component_instructor_id
  FROM topics t JOIN components c ON c.id = t.component_id JOIN training_programs p ON p.id = c.program_id
  WHERE t.id = p_topic_id AND t.is_deleted = FALSE;

  IF v_program_tenant_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'target_not_found';
  END IF;
  IF p_actor_role = 'instructor' AND p_actor_user_id <> v_component_instructor_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  ELSEIF p_actor_role <> 'super_admin' AND v_program_tenant_id <> p_actor_tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant_mismatch';
  END IF;

  SELECT ce.student_id, su.full_name AS student_name, a.id AS attendance_id,
         ast.code AS status_code, ast.label AS status_label,
         ar.code AS reason_code, ar.label AS reason_label, a.observations
  FROM component_enrollments ce
  JOIN users su ON su.id = ce.student_id
  JOIN topics t ON t.id = p_topic_id
  LEFT JOIN attendance a ON a.topic_id = p_topic_id AND a.student_id = ce.student_id AND a.is_deleted = FALSE
  LEFT JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
  LEFT JOIN master_catalog_values ar ON ar.id = a.reason_id
  WHERE ce.component_id = t.component_id AND ce.is_deleted = FALSE
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
  IN p_leave_type_code VARCHAR(80), IN p_evidence_url VARCHAR(500)
)
BEGIN
  DECLARE v_status_id BIGINT UNSIGNED;
  DECLARE v_type_id BIGINT UNSIGNED;

  IF p_actor_role <> 'student' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
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

  INSERT INTO leave_requests (student_id, starts_on, ends_on, reason, leave_type_id, evidence_url, status_id, created_by)
  VALUES (p_actor_user_id, p_starts_on, p_ends_on, p_reason, v_type_id, p_evidence_url, v_status_id, p_actor_user_id);

  SELECT LAST_INSERT_ID() AS leave_request_id;
END$$

CREATE PROCEDURE sp_leave_requests_list(
  IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80), IN p_actor_tenant_id BIGINT UNSIGNED
)
BEGIN
  SELECT l.id, l.student_id, su.full_name AS student_name, l.starts_on, l.ends_on, l.reason,
         lt.code AS type_code, lt.label AS type_label, l.evidence_url,
         ls.code AS status_code, ls.label AS status_label,
         l.admin_comments, l.resolved_at, l.created_at
  FROM leave_requests l
  JOIN users su ON su.id = l.student_id
  JOIN master_catalog_values ls ON ls.id = l.status_id
  LEFT JOIN master_catalog_values lt ON lt.id = l.leave_type_id
  WHERE l.is_deleted = FALSE
    AND (
      (p_actor_role = 'student' AND l.student_id = p_actor_user_id)
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
END$$

-- Componentes propios de un instructor (para su vista "Mis clases" / temario / asistencia).
CREATE PROCEDURE sp_components_list_by_instructor(IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'instructor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT c.id, c.name, c.description, cs.code AS status_code, cs.label AS status_label,
         p.id AS program_id, p.name AS program_name, p.cohort
  FROM components c
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values cs ON cs.id = c.status_id
  WHERE c.instructor_id = p_actor_user_id AND c.is_deleted = FALSE AND p.is_deleted = FALSE
  ORDER BY p.name, c.sort_order;
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
  JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
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
    iu.full_name AS instructor_name,
    COUNT(a.id) AS total_records,
    SUM(ast.code IN ('present', 'late')) AS present_count,
    SUM(ast.code = 'absent') AS absent_count,
    SUM(ast.code = 'justified_absent') AS justified_count,
    ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(a.id), 0), 1) AS attendance_rate
  FROM components c
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  LEFT JOIN users iu ON iu.id = c.instructor_id
  JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
  JOIN attendance a ON a.topic_id = t.id AND a.is_deleted = FALSE
  JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
  WHERE c.is_deleted = FALSE AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)
  GROUP BY c.id, c.name, p.id, p.name, iu.full_name
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
  JOIN components c ON c.id = t.component_id
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
  LEFT JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
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
    (SELECT COUNT(*) FROM component_enrollments ce WHERE ce.component_id = c.id AND ce.is_deleted = FALSE) AS enrolled_students,
    COUNT(t.id) AS total_topics,
    SUM(ts.code = 'completed') AS completed_topics,
    ROUND(100 * SUM(ts.code = 'completed') / NULLIF(COUNT(t.id), 0), 1) AS progress_pct
  FROM components c
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  LEFT JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
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
  JOIN components c ON c.instructor_id = iu.id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id AND p.is_deleted = FALSE
  JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
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
  JOIN components c ON c.id = t.component_id
  JOIN training_programs p ON p.id = c.program_id
  JOIN master_catalog_values ts ON ts.id = t.status_id
  LEFT JOIN users iu ON iu.id = c.instructor_id
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
  JOIN components c ON c.id = t.component_id
  JOIN training_programs p ON p.id = c.program_id
  LEFT JOIN users iu ON iu.id = c.instructor_id
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
    (SELECT COUNT(*) FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN components c ON c.id = t.component_id
       JOIN training_programs p ON p.id = c.program_id
       WHERE a.is_deleted = FALSE AND t.scheduled_on BETWEEN p_period_start AND p_period_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)) AS attendance_records,
    (SELECT ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(*), 0), 1)
       FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN components c ON c.id = t.component_id
       JOIN training_programs p ON p.id = c.program_id JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
       WHERE a.is_deleted = FALSE AND t.scheduled_on BETWEEN p_period_start AND p_period_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)) AS attendance_rate,
    (SELECT COUNT(*) FROM topics t JOIN components c ON c.id = t.component_id JOIN training_programs p ON p.id = c.program_id
       JOIN master_catalog_values ts ON ts.id = t.status_id
       WHERE t.is_deleted = FALSE AND ts.code = 'completed' AND t.actual_date BETWEEN p_period_start AND p_period_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)) AS topics_completed,
    (SELECT COUNT(*) FROM leave_requests l JOIN users su ON su.id = l.student_id
       WHERE l.is_deleted = FALSE AND l.created_at BETWEEN p_period_start AND DATE_ADD(p_period_end, INTERVAL 1 DAY)
         AND (v_tenant_filter IS NULL OR su.tenant_id = v_tenant_filter)) AS leave_requests_created

  UNION ALL

  SELECT 'previous', v_prev_start, v_prev_end,
    (SELECT COUNT(*) FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN components c ON c.id = t.component_id
       JOIN training_programs p ON p.id = c.program_id
       WHERE a.is_deleted = FALSE AND t.scheduled_on BETWEEN v_prev_start AND v_prev_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)),
    (SELECT ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(*), 0), 1)
       FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN components c ON c.id = t.component_id
       JOIN training_programs p ON p.id = c.program_id JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
       WHERE a.is_deleted = FALSE AND t.scheduled_on BETWEEN v_prev_start AND v_prev_end
         AND (v_tenant_filter IS NULL OR p.tenant_id = v_tenant_filter)),
    (SELECT COUNT(*) FROM topics t JOIN components c ON c.id = t.component_id JOIN training_programs p ON p.id = c.program_id
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
  FROM component_enrollments ce
  JOIN components c ON c.id = ce.component_id AND c.is_deleted = FALSE
  JOIN training_programs p ON p.id = c.program_id
  JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
  JOIN master_catalog_values ts ON ts.id = t.status_id
  LEFT JOIN users iu ON iu.id = c.instructor_id
  WHERE ce.student_id = p_actor_user_id AND ce.is_deleted = FALSE
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
    (SELECT COUNT(*) FROM component_enrollments ce JOIN components c ON c.id = ce.component_id AND c.is_deleted = FALSE
       JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE JOIN master_catalog_values ts ON ts.id = t.status_id
       WHERE ce.student_id = p_actor_user_id AND ce.is_deleted = FALSE AND ts.code NOT IN ('completed', 'cancelled')) AS topics_pending,
    (SELECT ROUND(AVG(prog.progress_pct), 1) FROM (
       SELECT p.id, ROUND(100 * SUM(ts.code = 'completed') / NULLIF(COUNT(t.id), 0), 1) AS progress_pct
       FROM program_enrollments pe
       JOIN training_programs p ON p.id = pe.program_id AND p.is_deleted = FALSE
       JOIN components c ON c.program_id = p.id AND c.is_deleted = FALSE
       JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
       JOIN master_catalog_values ts ON ts.id = t.status_id
       WHERE pe.student_id = p_actor_user_id AND pe.is_deleted = FALSE
       GROUP BY p.id
     ) prog) AS program_progress_pct;
END$$

CREATE PROCEDURE sp_instructor_agenda(IN p_actor_user_id BIGINT UNSIGNED, IN p_actor_role VARCHAR(80))
BEGIN
  IF p_actor_role <> 'instructor' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not_authorized';
  END IF;

  SELECT t.id AS topic_id, t.title, t.scheduled_on, t.duration_minutes,
    p.name AS program_name, c.name AS component_name,
    (SELECT COUNT(*) FROM component_enrollments ce WHERE ce.component_id = c.id AND ce.is_deleted = FALSE) AS enrolled_students,
    ts.code AS status_code, ts.label AS status_label
  FROM components c
  JOIN training_programs p ON p.id = c.program_id
  JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
  JOIN master_catalog_values ts ON ts.id = t.status_id
  WHERE c.instructor_id = p_actor_user_id AND c.is_deleted = FALSE
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
    (SELECT COUNT(*) FROM components c JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
       WHERE c.instructor_id = p_actor_user_id AND c.is_deleted = FALSE
         AND t.scheduled_on BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)
    ) AS classes_this_week,
    (SELECT ROUND(100 * SUM(ast.code IN ('present', 'late')) / NULLIF(COUNT(*), 0), 1)
       FROM attendance a JOIN topics t ON t.id = a.topic_id JOIN components c ON c.id = t.component_id
       JOIN master_catalog_values ast ON ast.id = a.attendance_status_id
       WHERE c.instructor_id = p_actor_user_id AND a.is_deleted = FALSE) AS group_attendance_rate,
    (SELECT COUNT(*) FROM components c JOIN topics t ON t.component_id = c.id AND t.is_deleted = FALSE
       JOIN master_catalog_values ts ON ts.id = t.status_id
       WHERE c.instructor_id = p_actor_user_id AND c.is_deleted = FALSE
         AND t.scheduled_on IS NOT NULL AND t.scheduled_on < CURDATE() AND ts.code NOT IN ('completed', 'cancelled')
    ) AS delayed_topics;
END$$

CREATE PROCEDURE sp_dashboard_get(IN p_user_id BIGINT, IN p_role VARCHAR(80), IN p_tenant_id BIGINT)
BEGIN
  SELECT p_role AS role_code, p_user_id AS user_id, p_tenant_id AS tenant_id;
END$$

DELIMITER ;