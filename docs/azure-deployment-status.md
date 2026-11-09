> Histórico. El 08-11-2026 producción pasó a Cosmos Free Tier + GHCR y ACR fue retirado. Estado actual y rollback en [near-zero-deployment.md](near-zero-deployment.md). SQL se conserva como origen de rollback.

# Azure SQL + Trazo verificados — actualizado 28-09-2026 UTC

URL pública: https://trazo-mvp.agreeableisland-910dddf7.centralus.azurecontainerapps.io

## Última revisión: navegación Strength → Progreso

Revisión `trazo-mvp--20260927212107`, imagen `trazomvp585dbf3fa.azurecr.io/trazo:20260927212107`, digest `sha256:fe03fbef4faa414655af0f81a2731115fcf17224684282d03eef8c9be5caaab4`. Se actualizó solo la imagen de la Container App existente, conservando las referencias a secretos, el entorno Central US, escala 0–1 y `Database__Initialize=false` / `Database__SeedDemo=false`. La revisión quedó Healthy con 100 % del tráfico y `/health/ready` 200.

La suite local de navegador, build y lint frontend pasaron. La prueba de producción abrió una actividad Strength existente, siguió su nombre de ejercicio hacia `/progress?exercise=...` y cargó el historial. También verificó desktop ancho, móvil, `/import`, ausencia de overflow y de errores del navegador. Captura: `artifacts/azure-production-ui/progress-from-strength-mobile.png`. Azure SQL conserva `useFreeLimit=true`, `freeLimitExhaustionBehavior=AutoPause` y pausa de 60 minutos. No se creó migración ni se ejecutó seed. Los datos de usuario no se modificaron en esta revisión.

Todas las verificaciones Production del runner terminaron con exit code 0. No se eliminó ningún recurso persistente ni se configuró dominio personalizado; se retiró únicamente la regla temporal de firewall prevista para migrar.

## Configuración efectiva final

| Campo | Verificado |
|---|---|
| Logical server / DB | sql-trazo-mvp-585dbf3fa / trazo |
| Región | Central US |
| SKU | GP_S_Gen5 Serverless, min 0.5 / max 2 vCores |
| Free Offer | useFreeLimit=true |
| Al agotar cuota | freeLimitExhaustionBehavior=AutoPause; sin BillOverUsage |
| autoPauseDelay | 60 minutos |
| Tamaño máximo | 34.359.738.368 bytes (32 GiB) |
| Backup | Local, retención 7 días |
| Redundancia zonal / Defender de pago | false / Disabled |
| Cifrado SQL | TDE Enabled |
| Container App | trazo-mvp, Consumption, 0.25 CPU / 0.5 GiB, 0–1 réplicas |
| Revisión | trazo-mvp--20260927212107 |
| Inicialización / seed Production | false / false |

Migraciones aplicadas: 20260926163609_InitialSqlServer, 20260927053230_AddOtherActivity y 20260927185410_AddWalkingDetails. Conteos después del último deployment: Activities=6 (Running=2, Strength=3, Walking=1, Other=0), BodyMeasurements=0, PendingMigrations=0. Los conteos y fingerprint de Activities se conservaron al migrar; no hubo seed.

Firewall SQL: 161 IPs individuales, coincidentes con las salidas publicadas de ACA; sin reglas generales ni regla temporal de migración. Conexión TLS validada y usuario trazo_app con CONNECT/CRUD, sin DDL. Secretos en Container Apps y respaldo local cifrado fuera del workspace.

## Resultados

- Build backend, EF sin cambios pendientes, build/lint frontend, api-smoke y Docker Production: PASS.
- Azure HTTPS, SPA/import, login incorrecto/correcto, cookies Secure/HttpOnly/Strict, sesión/refresh, dashboard, lectura de actividades y mediciones, CSRF y logout: PASS.
- Importación Running/Strength, laps/sets, nulls, rawPayload preciso, datos de gráficos y create/read/delete: PASS. Actividades de prueba eliminadas.
- Sesión conservada tras reemplazar el contenedor mediante revision restart: PASS.
- ACA en cero réplicas observado a los 8,6 minutos. SQL Paused junto con cero réplicas observado a los 16,26 minutos de esta ventana. Ese es el tiempo observado; la propiedad ARM continúa en 60 y no se forzó la pausa. No se garantiza que siempre pause a los 16 minutos.
- Cold start desde cero con SQL previamente Paused: **76,441 segundos** hasta readiness 200. SQL ya estaba Online al terminar: la reanudación está incluida en ese tiempo, no se midió por separado.
- Misma sesión autenticada y dashboard: **2,519 segundos adicionales**. Persistencia de claves/sesión tras scale-to-zero y pausa SQL: PASS.
- Logs antes del restart y después de reanudar: muestras de hasta 300 líneas sin secretos conocidos ni payload de prueba. No es una auditoría histórica completa; no hay Log Analytics.

ASP.NET precarga DataProtection una vez al iniciar el proceso y puede despertar SQL antes de readiness. Las probes periódicas no consultan la DB. La aserción inicial que exigía conservar SQL Paused después del arranque era incorrecta; se corrigió el test, sin cambiar el backend. Detalle en sql-server-migration.md.

## Cuota y recursos conservados

Última muestra disponible de Azure Monitor: **18:12 UTC, 27-09-2026**, con **4.814 vCore-seconds consumidos y 95.186 restantes de 100.000 mensuales**. La métrica llega con retraso y no representa necesariamente el consumo exacto al terminar. SQL queda en USD 0 bajo esta oferta y se pausa al agotarla, sin autorizar exceso. ACR conserva su cargo existente.

PostgreSQL `pg-trazo-mvp-585dbf3fa` fue eliminado posteriormente con autorización del usuario y no aparece en el inventario actual. Se reutilizaron ACR/identidad y `cae-trazo-mvp-central`. El entorno vacío `cae-trazo-mvp` de East US 2 permanece intacto.

La verificación específica de Other/períodos y WalkingDetails está en [azure-iteration-deployment-20260927.md](azure-iteration-deployment-20260927.md).

Evidencia: artifacts/azure-production-verification.json, artifacts/azure-sql-effective-config.json, artifacts/azure-app-effective-config.json y artifacts/azure-sql-free-quota-final.json.

Para obtener la contraseña inicial personal sin imprimirla, ejecutar scripts/azure/Copy-InitialPassword.ps1. La copia al portapapeles; guardarla en un gestor y limpiar el portapapeles después. No regenerar el hash para acceder: eso sería una rotación de credenciales.

---

## Registro histórico: verificación en curso (superado)

El usuario autorizó `autoPauseDelay=60`. Ya se completaron:

- SQL `sql-trazo-mvp-585dbf3fa` / DB `trazo` en Central US, Online.
- Free efectivo: `useFreeLimit=true`, `freeLimitExhaustionBehavior=AutoPause`, pausa 60 minutos, min 0.5/max 2 vCores, 32 GiB, backup Local/7 días, zoneRedundant=false, Defender Disabled.
- Migración `20260926163609_InitialSqlServer` aplicada. Conteos iniciales medidos: Activities=0, BodyMeasurements=0, PendingMigrations=0. SeedDemo=false; sin copia de datos PostgreSQL.
- Container App `trazo-mvp`, revisión `trazo-mvp--20260926155954`, Succeeded, Consumption 0–1 réplica.
- URL: https://trazo-mvp.agreeableisland-910dddf7.centralus.azurecontainerapps.io
- Firewall SQL: 161 reglas de IP individual coincidentes con las salidas publicadas de ACA; sin acceso general ni regla temporal de migración.
- Pruebas HTTPS/auth/session/refresh/importación Running y Strength/laps/sets/precisión raw JSON/dashboard/gráficos/create-read-delete pasan. Actividades de prueba eliminadas. BodyMeasurements continúa vacío.
- Muestra de hasta 300 líneas de logs sin secretos conocidos ni payload de prueba.

**Todavía pendientes:** evidencia de sesión tras reemplazo efectivo del contenedor, ACA scale-to-zero, SQL Paused→Online, tiempos observados y logout final. El runner `tests/azure-smoke.mjs --cold-start` mantiene la cookie en memoria y espera el plazo de 60 minutos sin HTTP; consulta únicamente Azure Management. No presentar esas comprobaciones como completadas hasta disponer del resultado.

PostgreSQL se conserva intacto. No eliminarlo todavía. Evidencia segura de configuración en `artifacts/azure-sql-effective-config.json` y `artifacts/azure-app-effective-config.json`. El resultado final se guardará en `artifacts/azure-production-verification.json`.

---

## Historial anterior

# Migración a Azure SQL autorizada — estado 26-09-2026

La autorización nueva sustituye la pausa histórica registrada más abajo. El código ya usa SQL Server y pasó las pruebas locales/API/Docker. PostgreSQL no se modificó.

- Logical server `sql-trazo-mvp-585dbf3fa`: Central US, Ready, TLS 1.2, firewall sin reglas, Defender SQL Disabled.
- DB `trazo`: **no creada**. Solo existe `master` del servidor lógico.
- ARM rechazó dos intentos con los parámetros autorizados: `ProvisioningDisabled — Only default value for auto pause delay is allowed for Free Limit database with auto pause exhaustion behavior`.
- Las capacidades generales GP_S_Gen5_2 publican mínimo 15 y default 60; Free + AutoPause exige el default. Se pidió autorización para cambiar de 15 a 60 minutos. No se creó una DB pagada ni se cambió a BillOverUsage.
- Container App y URL pública: todavía no existen. ACR, identidad y ambos entornos siguen disponibles para reutilizar; no se eliminaron recursos.
- PostgreSQL `pg-trazo-mvp-585dbf3fa`: verificado Ready, Standard_B1ms, acceso público Disabled. No se detuvo, borró ni migró.
- Conteos iniciales Azure SQL, cold-start, auto-pause/resume y pruebas Production en Azure: **pendientes**, no confundir con los tests locales de Production en Docker que sí pasaron.

No eliminar PostgreSQL. Reanudar provisioning solo tras resolver el cambio explícito de auto-pause; después migrate -InitialEmptyCheck, deployment y verificación completa.

---

## Registro histórico anterior (superado por la autorización actual)

# Deployment pausado explícitamente — 25-09-2026

El usuario pidió detener el deployment para comparar persistencia. **No reanudar
provisioning, migraciones ni deployment sin una nueva instrucción.** No destruir
recursos ni cambiar arquitectura durante la comparación.

## Estado comprobado a las 16:39 America/Santiago

Suscripción activa: Visual Studio Professional Subscription,
`7333ebe0-1f75-4e4d-baf1-424585dbf3fa`. Grupo: `rg-trazo-mvp`.

| Recurso | Región | Estado |
|---|---|---|
| `trazomvp585dbf3fa` | East US 2 | ACR Basic creado, reutilizado, sin imagen de Trazo publicada |
| `id-trazo-pull` | East US 2 | Identidad creada, AcrPull sobre el ACR |
| `cae-trazo-mvp` | East US 2 | Succeeded, vacío; solo Consumption, sin Log Analytics ni endpoints privados |
| `cae-trazo-mvp-central` | Central US | Succeeded, vacío; solo Consumption, sin Log Analytics |
| `pg-trazo-mvp-585dbf3fa` | Central US | Ready; PostgreSQL 17, Burstable Standard_B1ms, 1 vCore/2 GiB, 32 GiB, backup 7 días, sin HA/geo; acceso público Disabled |

El proceso local de provisioning se interrumpió al recibir la pausa. La creación
de PostgreSQL ya estaba aceptada por Azure y terminó de forma independiente.
La consulta de bases devuelve únicamente `azure_maintenance`, `postgres` y
`azure_sys`: **la base `progress` aún no existe**. No hay tablas de aplicación,
migraciones, seed, Container App, revisión ni URL pública. Por tanto los conteos
de Activities/BodyMeasurements todavía no son verificables; no afirmar que se
midieron en cero. No se copiaron ni modificaron datos locales.

No se detuvo ni eliminó ningún recurso Azure. El costo fijo aproximado activo es
USD 18,18/mes de PostgreSQL + USD 5,07/mes de ACR = USD 23,25/mes, antes de extras.
Los entornos vacíos de Consumption no tienen cargo fijo de plan esperado en esta
configuración. La pausa del trabajo no suspende el cobro de PostgreSQL/ACR.

## Para una eventual reanudación autorizada

1. Volver a consultar estado y suscripción. `config.local.ps1` apunta a Central US
   y `cae-trazo-mvp-central`, manteniendo el ACR, identidad y grupo existentes.
2. Completar `provision.ps1`: reutilizar PostgreSQL existente y crear `progress`.
3. Revisar antes de ejecutar `migrate.ps1`: el cambio local que contempla
   `publicNetworkAccess=Disabled` quedó aplicado, pero su llamada a listar reglas
   con el acceso deshabilitado es rechazada por Azure CLI. Corregir/verificar esa
   secuencia sin abrir rangos globales antes de aplicar migraciones.
4. Migración explícita, verificación inicial vacía, rol de ejecución, deployment
   y pruebas HTTPS/cold-start siguen pendientes. No ejecutar automáticamente.

Las credenciales iniciales están cifradas mediante DPAPI/ACL del usuario en
`%LOCALAPPDATA%\Trazo\azure-credentials.clixml`; no están en el repositorio.
El auxiliar local `run-authorized-deployment.ps1` está detenido. No hay automatización
programada para continuar. La comparación se documenta por separado.

Actualización del 26-09-2026: por autorización específica se registró únicamente
Microsoft.Sql. La [verificación SQL Free](azure-sql-free-operational-check.md)
confirma disponibilidad con AutoPause en Central US y un cupo libre. No se creó
logical SQL server ni DB SQL. Trazo continúa pausado; PostgreSQL sigue intacto.
