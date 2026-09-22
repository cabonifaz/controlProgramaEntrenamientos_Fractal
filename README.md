# Control Programa de Entrenamientos

## Entornos

- `main`: producción, base de datos `controlProgramaEntrenamientos`.
- `staging`: preproducción, base de datos `controlProgramaEntrenamientos_staging`.

Las credenciales y cadenas de conexión deben configurarse mediante variables de entorno o secretos del entorno. No deben almacenarse en el repositorio.

## Arquitectura acordada

- Monolito JavaScript: React para la interfaz y Node/Express para la API.
- MySQL como persistencia, con una base por entorno.
- Las reglas de negocio y las consultas viven en procedimientos almacenados; la API solo valida la sesión, autoriza y orquesta llamadas a SP.
- Los catálogos configurables se administran mediante un maestro de maestros, evitando enums rígidos para estados, roles, tipos y motivos.
- Las tablas de negocio deben incluir auditoría: `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by` y `is_deleted` cuando aplique.
- El aislamiento multi-tenant se aplica mediante `tenant_id` y procedimientos almacenados con autorización por tenant.