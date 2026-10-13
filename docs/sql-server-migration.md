> Actualización: el usuario autorizó autoPauseDelay=60. Provisioning reanudado con Free + AutoPause; los rechazos de 15 minutos se conservan abajo como registro histórico.

# Migración de persistencia a SQL Server — 26-09-2026

El código nuevo utiliza Microsoft.EntityFrameworkCore.SqlServer 10.0.12 en lugar de Npgsql.EntityFrameworkCore.PostgreSQL 10.0.0. Dominio, DTOs, rutas, dashboard y flujo de importación siguen siendo los mismos. No se migran datos de PostgreSQL.

## Esquema

- Guid → uniqueidentifier; DateOnly → date; DateTime de auditoría → datetime2(7), con conversión UTC al materializar. No se trunca precisión temporal.
- double → float(53). SQL Server rechaza NaN e infinitos nativamente; ya no hacen falta los checks específicos de PostgreSQL contra Infinity. La API sigue comprobando valores finitos y permite elevaciones negativas.
- Nulls, índices de fecha, PK/FK, cascadas Activity→RunningDetails→laps y Activity→exercises→sets, índices únicos de orden/set y checks de métricas se conservan. Los enums almacenados como texto usan collation binaria para mantener checks sensibles a mayúsculas.
- Las reglas entre tablas (por ejemplo Running obligatorio para Running, Strength con ejercicios, suma de laps) siguen en la validación de API, igual que antes. No se presenta esa validación como una constraint SQL.
- rawPayload → nvarchar(max), convertidor JsonDocument/texto y ValueComparer. CHECK `RawPayload IS NULL OR ISJSON(RawPayload, VALUE)=1` acepta objetos, arrays y escalares. No se convierte ningún número a double. Se preservan `9007199254740993`, `1e400`, decimales largos y texto original; `rawPayloadJson` mantiene su contrato.
- Diferencia deliberada respecto a JSONB: no se normaliza formato, orden ni claves duplicadas. Los límites numéricos internos de PostgreSQL y su prohibición del NUL escapado ya no corresponden a este almacenamiento opaco; se aceptan como JSON textual, sin extraerlos a tipos numéricos SQL.
- DataProtectionKeys permanece en el mismo DbContext y usa la nueva base. Docker verifica persistencia de sesión al reiniciar y al recrear contenedores.
- SeedHistory conserva el guard permanente; `sp_getapplock` transaccional reemplaza el advisory lock PostgreSQL. El seed solo funciona en Development, con opt-in y base terminada en `_demo`.

## Migraciones y operación

`backend/Migrations/*InitialSqlServer*` es la migración inicial nueva. El historial PostgreSQL completo se conserva en `docs/legacy/postgresql-migrations/`, fuera del proyecto compilado. Nunca aplicarlo a SQL Server. PostgreSQL local y Azure permanecen intactos; el backend nuevo no sirve para conectarse a ellos. No se promete rollback del binario sin restaurar también la versión PostgreSQL del código.

Production no migra ni siembra al arrancar. `--check-database --require-empty` es la comprobación explícita posterior a migrar. El usuario contenido `trazo_app` tiene CONNECT y CRUD sobre dbo, sin permisos DDL. Las credenciales se configuran por secretos; TLS se valida en Azure.

`/health/live` y `/health/ready` solo prueban el proceso y no acceden a SQL. No certifican la conectividad ni el esquema: eso lo verifican migraciones, pruebas funcionales y el comando explícito. No hay jobs periódicos; la conexión Azure desactiva pooling y Production habilita reintentos transitorios para despertar SQL serverless. La conexión usa timeout de 60 segundos.

## Evidencia local

Build backend, comprobación EF sin cambios pendientes, build/lint frontend y api-smoke pasan. La suite usa SQL Server 2022 real: dominio, importación, precisión JSON, nulls, cascadas, CHECKs, UTC/DateOnly, semana lunes-domingo, 30 días, DST Santiago y seed concurrente. Docker Production pasa: no root, sin migración/seed automáticos, rol restringido, cookies Secure/HttpOnly/Strict, CSRF, login/logout, rechazo de cookies alteradas, persistencia tras restart y rotación de contraseña.

## Restricción Azure encontrada al crear

La creación Free con `autoPauseDelay=15` fue rechazada por ARM:

> Only default value for auto pause delay is allowed for Free Limit database with auto pause exhaustion behavior

El default publicado es 60 minutos. Las capacidades generales anuncian mínimo 15, pero no garantizan esa combinación con Free + AutoPause. Se creó únicamente el logical server; no se cambió a una oferta pagada. El cambio a 60 minutos requiere la aprobación del usuario antes de continuar. Véase [configuración Serverless oficial](https://learn.microsoft.com/azure/azure-sql/database/serverless-tier-overview#default-settings).

## Arranque y probes

ASP.NET Core registra DataProtectionHostedService, que precarga una vez el key ring al iniciar el proceso. Como está persistido en SQL, arrancar un contenedor nuevo puede reanudar la base incluso si la primera petición es `/health/ready`. Esto no es una consulta periódica de la probe. Una vez iniciado, live/ready siguen sin acceder a SQL. La prueba de cold start mide el arranque completo y registra si SQL ya estaba Online antes de validar la sesión.

Fuente: [DataProtectionHostedService de ASP.NET Core 10](https://github.com/dotnet/aspnetcore/blob/v10.0.0/src/DataProtection/DataProtection/src/Internal/DataProtectionHostedService.cs). Una primera aserción que exigía SQL Paused después del arranque era incorrecta; se corrigió el test, sin modificar sesiones ni backend.
