const STATUS_BY_SP_MESSAGE = {
  not_authorized: 403,
  role_not_allowed_for_actor: 400,
  tenant_required: 400,
  tenant_mismatch: 400,
  invalid_status: 400,
  instructor_invalid: 400,
  student_invalid: 400,
  student_not_enrolled_in_program: 400,
  invalid_date_range: 400,
  invalid_schedule_day: 400,
  schedule_not_configured: 409,
  schedule_generation_failed: 409,
  instructor_not_available: 409,
  instructor_schedule_conflict: 409,
  date_is_holiday: 409,
  tenant_inactive: 409,
  email_already_exists: 409,
  slug_already_exists: 409,
  holiday_already_exists: 409,
  already_enrolled: 409,
  leave_not_pending: 409,
  tenant_not_found: 404,
  target_not_found: 404,
  program_not_found: 404,
  component_not_found: 404,
  group_not_found: 404,
}

// Los procedimientos almacenados comunican decisiones de negocio con
// SIGNAL SQLSTATE '45000'. Esta funcion traduce ese mensaje a una
// respuesta HTTP sin volver a tomar la decision en JavaScript.
export function mapStoredProcedureError(err) {
  const message = err?.sqlMessage
  if (message && STATUS_BY_SP_MESSAGE[message]) {
    return { status: STATUS_BY_SP_MESSAGE[message], message }
  }
  return { status: 500, message: 'Unexpected server error' }
}
