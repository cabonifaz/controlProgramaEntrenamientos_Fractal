# Base de datos

`schema.sql` contiene el modelo, el maestro de maestros, los campos de auditoria y los procedimientos almacenados.

La API no debe incorporar consultas de negocio. Solo puede invocar procedimientos almacenados mediante `server/db.js`; cualquier cambio de reglas, autorizacion, calendario, feriados, asignaciones, alertas o reportes se implementa en la capa SQL de procedimientos.

## Dos credenciales por entorno

- **Migracion** (`MIGRATION_DB_USER` / `MIGRATION_DB_PASSWORD`, p.ej. `dev_admin`): puede crear/alterar tablas y procedimientos. Solo la usan los scripts de este directorio, nunca el servidor.
- **Runtime de la app** (`DB_USER` / `DB_PASSWORD`, p.ej. `app_staging` / `app_production`): permiso unicamente `EXECUTE` sobre la base de su entorno. La app solo hace `CALL sp_...`, nunca toca tablas directo, asi que no necesita mas. Esto tambien refuerza a nivel de base de datos la regla de "sin queries directas en la API": aunque alguien se equivoque en el codigo, el usuario de conexion fisicamente no puede hacer un `SELECT`/`INSERT` crudo.

## Flujo para aplicar el schema a un entorno nuevo

```
# 1. Aplicar tablas + procedimientos (usa el credential de migracion)
TARGET_DB=controlProgramaEntrenamientos_staging npm run db:apply-schema   # staging
TARGET_DB=controlProgramaEntrenamientos npm run db:apply-schema          # produccion

# 2. Crear (o rotar) los usuarios de runtime EXECUTE-only de ambos entornos
npm run db:create-app-users

# 3. Verificar (usa el credential de migracion; hace SELECT directo para inspeccionar)
node database/verify-schema.js controlProgramaEntrenamientos_staging
node database/verify-schema.js controlProgramaEntrenamientos

# 4. Crear el superadmin inicial de ese entorno (usa el credential de runtime, alcanza con EXECUTE)
npm run seed:superadmin
```

`TARGET_DB` es opcional: sin especificarlo, `db:apply-schema` corre contra `controlProgramaEntrenamientos_staging` (la base que `schema.sql` trae fija en su sentencia `USE`), sin necesidad de editar el archivo.