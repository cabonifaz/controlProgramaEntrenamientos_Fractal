# Base de datos

`schema.sql` contiene el modelo, el maestro de maestros, los campos de auditoria y los procedimientos almacenados.

Ejecutar el archivo una vez contra `controlProgramaEntrenamientos_staging` y otra contra `controlProgramaEntrenamientos`, cambiando la sentencia `USE` al inicio de cada ejecucion. Las credenciales de cada entorno se entregan por separado al servidor de despliegue.

La API no debe incorporar consultas de negocio. Solo puede invocar procedimientos almacenados mediante `server/db.js`; cualquier cambio de reglas, autorizacion, calendario, feriados, asignaciones, alertas o reportes se implementa en la capa SQL de procedimientos.