# Trazo · diario personal de entrenamiento

MVP para registrar running, fuerza, caminatas, ciclismo, hiking, otros deportes y mediciones corporales. React + TypeScript + Vite y ASP.NET Core 10. Desarrollo local con EF Core/SQL Server; **producción migrada el 08-11-2026 a Cosmos DB Free Tier + GHCR + Container Apps Consumption, con una réplica siempre encendida por elección del usuario**. Se conservaron datos, claves de sesión, SQL y el checkpoint anterior para rollback. ACR fue retirado después de preservar su imagen original en GHCR. Estado, costos, límites y operaciones actuales en [docs/near-zero-deployment.md](docs/near-zero-deployment.md).

Documentación: [índice y vigencia de las guías](docs/README.md). Código publicado: [v0.2.0](https://github.com/crosbostol/Trazo/releases/tag/v0.2.0); publicar una imagen no la despliega automáticamente.

## Ejecutar localmente

Requisitos: .NET SDK 10, Node 24, Docker Desktop con contenedores Linux y unos 2 GiB libres para SQL Server 2022 Developer. El provider local predeterminado es SqlServer; producción configura `Database__Provider=Cosmos`. No conecta con PostgreSQL.

```powershell
./scripts/Use-LocalDatabase.ps1
# Pide la contraseña SA local. Usa siempre la misma para el volumen existente.
docker compose up -d --wait sqlserver
dotnet tool restore
dotnet build backend
./scripts/Initialize-RealDatabase.ps1
./scripts/New-AuthSecret.ps1
dotnet run --project backend
```

`Use-LocalDatabase.ps1` guarda conexión/contraseña solo en variables de esta terminal. `appsettings` no contiene contraseñas. SQL local escucha exclusivamente en `127.0.0.1:1433`; `TrustServerCertificate=True` es solo para su certificado local. Azure exige validación TLS. El volumen nuevo es `trazo_sql_data`. No borres volúmenes para cambiar de base.

La API escucha en http://127.0.0.1:5143. En otra terminal ejecuta `npm --prefix frontend ci` y `npm --prefix frontend run dev`; abre http://127.0.0.1:5173. Vite reenvía `/api`, sin CORS. `New-AuthSecret.ps1` pide la contraseña personal, no la de SQL, y configura el hash de login. No hay bypass de autenticación. En Production el hash de login vive en Container Apps y Cosmos usa identidad administrada; la conexión SQL conservada es solo para rollback.

### Base real y demo

`progress` es la base real y `progress_demo` contiene ejemplos. El procedimiento anterior crea una base real vacía sin seed. Si ya tiene tablas, `Initialize-RealDatabase.ps1` se detiene sin cambiarlas. Con respaldo externo previo, API detenida y sin clientes SQL conectados, `-ArchiveExisting` permite conservar la base íntegra como `progress_legacy_AAAAMMDD_HHMMSS` y crear otra vacía; nunca termina conexiones ajenas ni elimina bases. Un archivo en el mismo volumen no reemplaza un backup externo.

Para demo, detén la API y ejecuta:

```powershell
./scripts/Use-LocalDatabase.ps1 -Demo
dotnet run --project backend
```

EF crea/aplica el esquema en Development. El seed exige Development, inicialización habilitada, `SeedDemo=true` y sufijo `_demo`. Una marca persistente y un bloqueo transaccional `sp_getapplock` impiden reinserciones concurrentes o después de borrar registros. Si encuentra datos existentes, cierra la posibilidad de sembrar sin mezclarlos. Son 36 actividades y 12 mediciones con fechas fijas alrededor del 21 de septiembre de 2026.

Para volver a real, detén la API, ejecuta `./scripts/Use-LocalDatabase.ps1` sin `-Demo` y reiníciala. Recarga el navegador. La cabecera y `/import` muestran nombre y modo; `/api/database-info` ofrece lo mismo sin credenciales. Ningún cambio de conexión mueve registros.

El PostgreSQL local anterior y su volumen `progress_data` permanecen intactos, fuera del flujo nuevo. Compose conserva el servicio bajo el perfil `legacy-postgresql` solo como referencia. No ejecutes migraciones SQL Server sobre esa base ni uses el backend nuevo para leerla. Las migraciones históricas se archivaron en `docs/legacy/postgresql-migrations/`, fuera de la compilación. No se migran datos automáticamente.

Para detener solo SQL nuevo: `docker compose stop sqlserver`. Para tests sobre el contenedor local iniciado usa la misma variable `TRAZO_SQL_PASSWORD`; el fallback `LocalOnly_Trazo_SQL_2026!` es exclusivo de fixtures locales y nunca se usa en Azure.

## Funcionalidades

- Dashboard oscuro y responsive: selector Semana/Mes/Personalizado, sesiones y métricas de running del período, series diarias/semanales y última actividad global.
- Actividades: listado cronológico, filtro por deporte, registro manual y detalle; eliminación con confirmación en pantalla.
- Importar: `/import`, JSON pegado, comprobación local, formato sin pérdida de precisión, vista previa, sensaciones editables y confirmación antes de guardar.
- Running: todas las métricas solicitadas, laps, sensaciones y payload original JSON opcional. Las métricas ausentes se mantienen como `null`.
- Fuerza: ejercicios ordenados, sets, repeticiones, peso opcional, duración opcional y lado izquierdo/derecho/ambos. Los sets por tiempo aceptan `reps: 0` si tienen duración.
- Cuerpo: registro independiente de peso/grasa corporal, notas, historial y gráfico.
- Estados de carga, vacío y error; reintento cuando no está disponible la API.

## Estructura

```text
/
├── frontend/
│   ├── src/
│   │   ├── pages/                 # Dashboard, actividades, detalle, registro, importación y cuerpo
│   │   ├── App.tsx               # Navegación y layout
│   │   ├── components.tsx        # Gráficos, tablas y componentes compartidos
│   │   ├── api.ts / useApi.ts    # Cliente HTTP y carga cancelable
│   │   ├── types.ts / metrics.ts # Contratos y etiquetas
│   │   └── App.css / index.css
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── Data/                    # DbContext y seed de desarrollo
│   ├── Models/                  # Dominio y relaciones
│   ├── DTOs/                    # Requests de creación
│   ├── Services/                # Validación y agregados del dashboard
│   ├── Endpoints/               # Endpoints REST (Minimal API)
│   ├── Persistence/             # Documentos Cosmos, codecs y key ring
│   ├── Migration/               # Exportación, importación y verificación offline
│   ├── Migrations/              # Migraciones SQL y snapshot EF
│   ├── Program.cs
│   └── Progress.Api.csproj
├── docs/README.md               # Índice de documentación vigente e histórica
├── infrastructure/near-zero/     # Plantilla Cosmos y evidencia del despliegue
├── tests/CosmosChecks/           # Regresiones de codecs sin servicios externos
├── tests/cosmos-api-smoke.mjs    # Integración Cosmos en base desechable explícita
├── tests/api-smoke.mjs           # Integración real con SQL Server aislado
├── tests/import-checks.mjs       # Importación y precisión, ejecutado por api-smoke
├── scripts/Initialize-RealDatabase.ps1 # Creación segura con archivo explícito
├── docker-compose.yml           # SQL Server local; PostgreSQL archivado en perfil legacy
├── dotnet-tools.json            # dotnet-ef local y versionado
└── README.md
```

## Decisiones de diseño

- **Un solo proyecto backend**, organizado por carpetas. Endpoints, validación y agregación organizados por carpetas, con persistencia Cosmos independiente del DbContext SQL y utilidades de migración offline.
- **.NET 10 y EF Core SQL Server 10.0.12**; sin Npgsql en el backend nuevo.
- **Activity común** para todos los deportes. Relaciones uno a uno opcionales con `RunningDetails` y `WalkingDetails`; ejercicios y sets para fuerza. En SQL las relaciones dependientes usan borrado en cascada y los órdenes/números de set tienen índices únicos. Cosmos guarda el agregado de actividad en documentos y aplica las reglas compartidas de la API, sin FK relacionales.
- **Fechas de entrenamiento sin hora (`DateOnly`)**; timestamps de auditoría en UTC. El dashboard calcula hoy en `America/Santiago`, configurable con `Dashboard__TimeZone`.
- **Duraciones en segundos**: `Activity.DurationSeconds` es el tiempo total común y coincide con `Running.TotalDurationSeconds`. La API completa este último si se omite; rechaza discrepancias. Ritmos en segundos/km, distancias en km y unidades explícitas para el resto.
- **Sensaciones** en `Activity`: `Mood` y `Energy` de 1–5, `Rpe` de 1–10, todos opcionales; `SubjectiveNotes` separa sensaciones de las notas generales.
- **JSON opaco**: SQL usa `nvarchar(max)` con CHECK `ISJSON(..., VALUE)`; Cosmos conserva `rawPayloadJson` como texto excluido del índice, con compresión y fragmentos cuando es necesario. Conserva texto, exponentes, decimales y claves duplicadas sin convertir números a double. `rawPayload` y `rawPayloadJson` conservan el contrato; el segundo evita redondeos en clientes JavaScript. Ya no se aplican los límites internos de JSONB: por ejemplo, `1e200000` y un NUL escapado pueden almacenarse como texto JSON. No se interpretan ni extraen métricas del payload. Ver [diferencias del provider](docs/sql-server-migration.md).
- **Recharts** para gráficos SVG responsive, en un chunk separado. El formulario de registro se carga de forma diferida. Fuentes incluidas en el frontend.
- **Autenticación personal por contraseña** detrás de `IPersonalAuthenticator`, cookie HttpOnly/Secure en Production, 12 horas, CSRF en escrituras y rate limit de login. Key ring persistido en Cosmos en producción y SQL en el provider local, para soportar reinicios/réplicas. Sin tabla Users ni multiusuario; evolución documentada en [docs/multi-user-roadmap.md](docs/multi-user-roadmap.md).
- `UpdatedAt` se inicializa junto a `CreatedAt`. No hay endpoint de edición en esta iteración; al añadirlo se deberá actualizar ese timestamp.

### Semántica del dashboard

- **Semana:** lunes a hoy. **Mes:** primer día del mes calendario a hoy (no últimos 30 días). **Personalizado:** ambas fechas inclusive, aplicadas al pulsar Aplicar período. Hoy se interpreta en `America/Santiago`.
- La UI consulta `GET /api/dashboard?from=AAAA-MM-DD&to=AAAA-MM-DD`. Ambos parámetros son obligatorios si se entrega alguno; fechas inválidas, inicio posterior al fin o fin posterior a hoy devuelven `400` con errores legibles. Se permite registrar actividades futuras, pero no incluirlas en el dashboard.
- Con rango, el contrato devuelve `asOf`, `from`, `to`, `granularity`, `sessions`, `distanceKm`, `paceSecondsPerKm`, `averageHeartRate`, `series`, `activities` y `latestActivity`. `activities` son solo los últimos cinco resúmenes del período; no se descarga el historial completo al dashboard. La última actividad es global, hasta hoy, independiente del filtro.
- Sesiones cuenta todos los tipos, incluido Other. Distancia, ritmo y FC corresponden exclusivamente a Running. Ritmo: `Σ(ritmo × distancia) / Σ(distancia)` con ambas métricas positivas. FC: promedio simple de FC media disponible por carrera; no ponderado por duración. Sin métricas válidas, ritmo/FC son `null`, no cero.
- Hasta **31 días inclusivos**, cada punto representa un día. Desde 32 días se agrupa por semanas lunes-domingo; los extremos se recortan al rango. Cada elemento de `series` incluye `date`, `endDate`, `sessions`, `distanceKm` y `paceSecondsPerKm` ponderado. Días/semanas vacíos muestran sesiones/distancia cero y ritmo desconocido. El tooltip indica los límites del intervalo; el gráfico permite alternar kilómetros y sesiones.
- Cada provider (SQL o Cosmos) filtra y agrega por fecha; el servidor agrupa esos resultados diarios en semanas. El cliente solo presenta los agregados. No se cargan rawPayload, laps ni sets para calcularlos.
- **Compatibilidad:** `/api/dashboard` sin fechas mantiene los campos y cálculos anteriores: conteo/distancia semanal, ritmo/FC/distancia de hoy−29 a hoy, `weeklyDistance` de 12 semanas y `paceHistory` por carrera. El nuevo selector utiliza siempre el contrato con rango.

### Caminatas normalizadas

Nuevas actividades Walking requieren un bloque `walking` (puede ser `{}`).
No se admite walking en otros tipos, running en Walking ni ejercicios de fuerza
en Walking. La duración total se completa desde la actividad; métricas
desconocidas admiten null. Walking suma sesiones sin cambiar los agregados de
Running. Registro manual, preview, detalle y listado muestran sus métricas.
Las caminatas antiguas y sus payloads se conservan sin backfill.
Ver [modelo, reglas, migración y pruebas](docs/walking-details.md) y
[JSON completo del ejemplo](docs/walking-activity.example.json).
AddWalkingDetails y AddOtherActivity se aplicaron a Azure el 27-09-2026; los seis registros existentes conservaron conteos y fingerprint.

### Otros deportes

`Other` permite duración, sensaciones, notas y rawPayload sin detalles de running ni ejercicios. `activitySubtype` es texto opcional (máximo 200 caracteres, sin NUL ni solo espacios); se recortan espacios exteriores. Solo Other admite un subtipo, sin catálogo cerrado ni tablas por deporte. Se muestra en listado, detalle, preview y última actividad; sin subtipo se muestra “Otra actividad”.

Ejemplo para Importar (reemplaza la fecha si corresponde):

```json
{
  "date": "2026-09-26",
  "type": "Other",
  "activitySubtype": "Football",
  "durationSeconds": 3600,
  "mood": 4,
  "energy": 3,
  "rpe": 6,
  "subjectiveNotes": "Partido con amigos",
  "rawPayload": { "source": "manual" }
}
```

La migración `20260927053230_AddOtherActivity` agrega una columna nullable y amplía el CHECK del enum, sin cambiar las filas existentes. Se aplica automáticamente solo al iniciar Development con inicialización habilitada. Se aplicó al SQL de Azure el 27-09-2026; desde el 08-11-2026 producción usa Cosmos y no ejecuta migraciones EF. No revertirla después de guardar Other sin preparar antes los datos: el CHECK anterior no acepta ese tipo y la columna de subtipo se perdería.

## API

Documento **OpenAPI** disponible en desarrollo, con sesión iniciada: **http://127.0.0.1:5143/openapi/v1.json**. Usa el mismo hostname que el frontend local para compartir la cookie. No se incluye una UI Swagger adicional. En Production no se publica OpenAPI.

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/api/auth/session` | Estado de sesión y token CSRF; bootstrap anónimo sin datos personales |
| POST | `/api/auth/login` | Verifica contraseña y establece cookie; requiere token CSRF |
| POST | `/api/auth/logout` | Cierra sesión; requiere sesión y CSRF |
| GET | `/health/live`, `/health/ready` | Salud del proceso sin consultar DB; no comprueba disponibilidad del almacenamiento |
| GET | `/api/database-info` | Nombre de base activa, indicador demo y advertencia de historial previo |
| POST | `/api/activities` | Crea actividad y sus detalles; `201` con `Location` |
| GET | `/api/activities` | Resúmenes ordenados por fecha descendente |
| GET | `/api/activities/{id}` | Detalle con laps/ejercicios/sets ordenados; `404` si no existe |
| DELETE | `/api/activities/{id}` | Borra actividad y dependencias; `204` o `404` |
| GET | `/api/dashboard` | Agregados y series temporales |
| GET | `/api/strength/exercises` | Ejercicios agrupados del historial de fuerza |
| GET | `/api/strength/progress?exercise=...` | Sesiones, sets, PRs y serie del ejercicio |
| POST | `/api/body-measurements` | Crea medición; `201` |
| GET | `/api/body-measurements` | Mediciones por fecha descendente |

Todas las rutas de datos requieren sesión; las escrituras también el encabezado `X-CSRF-TOKEN`, obtenido de `/api/auth/session` y actualizado después de login. Sin sesión devuelven `401`. Con autorización y CSRF válidos, los errores de dominio/deserialización devuelven `400` Problem Details en Development y Production; no se aceptan enums numéricos. Los identificadores y timestamps se generan en el servidor. Los IDs recibidos dentro de detalles/laps se reemplazan por el ID nuevo de la actividad. Los listados no tienen paginación. Cosmos devuelve `413` si los metadatos de una actividad exceden su límite conservador de 1,75 MB, independiente del payload fragmentado. En mantenimiento, `Database__ReadOnly=true` devuelve `503` y `Retry-After: 60` en escrituras de datos.

Running requiere `running` (puede ser `{}` si no hay métricas disponibles); Strength requiere al menos un ejercicio y cada ejercicio al menos un set. Se validan signos, valores finitos, medias que no superen máximos, altitud mínima/máxima, calorías activas/totales, tiempos y sets coherentes. Las altitudes negativas, potencia/cadencia cero y métricas ausentes son válidas. FC y ritmos informados deben ser positivos; no se imponen límites fisiológicos máximos. Un valor alto pero internamente consistente no se interpreta como diagnóstico ni se descarta.

Las vueltas necesitan número único positivo y distancia o duración. Pueden ser parciales: no se exige que cubran toda la actividad. Su suma no puede exceder los totales disponibles, salvo el error acumulado de redondear cada duración a un segundo y cada distancia a 0,01 km (media unidad por dato y por total). No se recalcula ni obliga a igualar el ritmo informado con duración/distancia: distintas fuentes pueden usar tiempo en movimiento.

En el provider SQL, sus checks protegen valores locales de las filas incluso ante escrituras directas; Cosmos no ofrece esos checks relacionales y depende de la validación compartida de la API. Las reglas entre tablas (deporte/detalles, presencia de ejercicios/sets, duración del padre y suma de vueltas) se protegen en la API; no hay triggers. Las escrituras fuera de la API deben respetarlas.

Ejemplo de request mínimo de running (los campos opcionales pueden omitirse):

```json
{
  "date": "2026-09-21",
  "type": "Running",
  "durationSeconds": 3113,
  "mood": 4,
  "energy": 3,
  "rpe": 4,
  "running": {
    "distanceKm": 6.32,
    "averagePaceSecondsPerKm": 492,
    "averageHeartRate": 145
  },
  "rawPayload": { "source": "manual" }
}
```

Ejemplo de fuerza:

```json
{
  "date": "2026-09-21",
  "type": "Strength",
  "durationSeconds": 1800,
  "exercises": [
    {
      "exerciseName": "Kettlebell swing",
      "order": 1,
      "sets": [
        { "setNumber": 1, "reps": 20, "weightKg": 16, "side": "Both" }
      ]
    }
  ]
}
```

## Usar `/import`

1. Abre **Importar** en la navegación principal y comprueba la base de destino.
2. Pega **un objeto JSON completo compatible con `POST /api/activities`**. Los ejemplos Running y Strength anteriores se pueden pegar directamente. `rawPayload` puede ser cualquier valor JSON válido; no necesita estructura especial.
3. **Validar** comprueba sintaxis, campos principales, escalas subjetivas y estructura básica localmente. Muestra fecha, duración, distancia, ritmo registrado, FC, Training Effect o ejercicios. No calcula métricas ausentes: muestra `—`. La comprobación completa del dominio  siguen en el endpoint existente al guardar, sin duplicar el modelo ni crear otro endpoint de importación.
4. Completa opcionalmente **Mood 1–5, Energy 1–5, RPE 1–10 y SubjectiveNotes**. Las etiquetas descriptivas son solo ayudas visuales. Los controles actualizan únicamente esos campos del JSON, sin alterar `rawPayload`. Las mismas etiquetas están en el formulario manual.
5. **Formatear JSON** cambia únicamente espacios y saltos de línea fuera de cadenas; conserva tokens como `9007199254740993`, `1e400` y decimales largos. Editar el textarea invalida la vista previa: pulsa Validar nuevamente.
6. Pulsa **Importar actividad**, revisa el destino y luego **Confirmar y guardar**. Solo esta última acción envía el POST. Si la API rechaza los datos, verás los errores y conservarás el texto para corregirlo.
7. Se abre el detalle de la actividad guardada. Al entrar a Actividades y Resumen se consultan datos nuevos; el registro aparece en listado y gráficos según sus métricas y fecha. Las actividades futuras no cuentan en el dashboard, como antes. Puedes eliminarlo desde el detalle con la confirmación existente.

En el detalle de cualquier actividad, **Copiar JSON para importar** genera el contrato completo y lo copia directamente al portapapeles, sin abrir una vista de JSON. Incluye métricas, vueltas, sets, notas, sensaciones y el texto exacto de `rawPayload`; omite IDs generados por el servidor. Funciona desde el botón en PC y celular, con aviso de éxito o de permiso denegado. Requiere HTTPS o localhost. Reconstruye el request desde los datos guardados: no recupera el formato ni campos desconocidos del JSON pegado originalmente. Las caminatas antiguas sin detalles se exportan con `walking: {}`.

La importación no deduplica sesiones ni incorpora sincronización. Si hay un corte de conexión después de confirmar, revisa Actividades antes de reintentar: el servidor podría haber guardado la actividad. No pegues nuevamente una actividad ya registrada.

## Progreso de fuerza

En **Progreso** (`/progress`) puedes seleccionar un ejercicio del historial Strength, ver cuatro PRs simples, el mejor peso por sesión y todos sus sets con acceso a la actividad original. Desde el detalle de una actividad Strength, el nombre de cada ejercicio abre directamente `/progress?exercise=...`; también puedes compartir esa URL. Los nombres se agrupan solo con trim y comparación sin distinguir mayúsculas; el peso desconocido permanece desconocido. No requiere migraciones ni modifica registros. [Contrato, semántica de PRs, pruebas y deuda técnica](docs/strength-progress.md).

## Migraciones, compilación y pruebas
Los comandos EF y el smoke SQL de esta sección corresponden al provider local SQL Server. Desde la raíz:

```powershell
dotnet build backend
dotnet run --project tests/CosmosChecks
dotnet ef migrations has-pending-model-changes --project backend
npm --prefix frontend run build
npm --prefix frontend run lint
node tests/api-smoke.mjs
```

El smoke SQL requiere Node 24 (ejecución directa de helpers TypeScript), SQL Server 2022 de Compose, PowerShell (`powershell.exe` en Windows o `pwsh` en otros sistemas) y la compilación Debug de la API. Inicia una API en **5144** y crea bases temporales `progress_test_<timestamp>` y `progress_test_<timestamp>_demo`; al terminar detiene sus procesos y elimina únicamente esas bases. No alteran `progress` ni datos personales. Además de la API, el script ejecuta `tests/ReviewChecks`, un pequeño proyecto de pruebas sin librerías nuevas, para comprobar actualización del esquema, checks SQL, seed concurrente y reloj controlado (lunes/domingo, medianoche y horario de verano/invierno de Santiago). Las pruebas HTTP cubren nulls, JSON y precisión, dominio, cascadas y ausencia de valores de payload en logs.

`tests/import-checks.mjs` añade Running/Strength, sintaxis y dominio inválidos, formato y edición subjetiva sin pérdida de precisión, importación efectiva, lectura, listado, series del dashboard y eliminación. `tests/database-setup-checks.mjs` ejecuta el procedimiento real de PowerShell sobre otra base temporal: verifica creación vacía, rechazo sin opt-in y conservación del historial al archivar; elimina solo su base temporal y su archivo al terminar. La prueba asistida de UI (pegar → preview → confirmar → detalle → listado/dashboard, errores y móvil) está documentada en [tests/import-ui.md](tests/import-ui.md). No se agregó una dependencia E2E; esa comprobación de navegador no forma parte del comando automático.

La iteración Other/períodos añade `dashboard-checks.mjs` al smoke y pruebas deterministas en ReviewChecks. `tests/dashboard-ui.mjs` automatiza además importación Football, creación manual, rangos, eliminación y cuatro viewports usando Playwright externo ya instalado, sin dependencias nuevas del proyecto. Instrucciones, capturas, semántica y deuda técnica: [informe de la iteración](docs/other-dashboard-iteration.md).

Si generas una migración nueva, vuelve a ejecutar `dotnet build backend` antes del smoke test: este inicia el DLL compilado. La migración de integridad rechaza datos anteriores que violen sus checks; no los borra ni corrige silenciosamente. Revísalos antes de aplicar el cambio sobre otra instalación.

### Pruebas Cosmos

`dotnet run --project tests/CosmosChecks` comprueba codecs y preservación exacta del texto JSON sin nube. CI ejecuta estas regresiones y el smoke SQL; no ejecuta integración contra una cuenta Cosmos.

`node tests/cosmos-api-smoke.mjs` requiere backend Debug compilado, una base **desechable precreada** `trazo_test_*` y su contenedor con partición `/ownerId`. Configura `COSMOS_TEST_ENDPOINT`, `COSMOS_TEST_DATABASE` y, si difiere de `records`, `COSMOS_TEST_CONTAINER`. Usa Azure CLI autenticada con permisos de datos y acceso de red al destino, o `COSMOS_TEST_KEY` solo si la cuenta de pruebas admite claves. `DOTNET_EXECUTABLE` permite seleccionar el SDK. El script prueba API local en puerto 5145 por defecto y no crea recursos Azure. Al terminar, el operador elimina la base de pruebas completa, incluidos claves, mediciones y fragmentos. Nunca apuntar al contenedor de producción. La ejecución contra Cosmos se verificó el 08-11-2026; no implica una ejecución en cada commit.

### Migraciones SQL

Para una migración futura del esquema SQL:

```powershell
dotnet ef migrations add NombreDelCambio --project backend
```

Para aplicar explícitamente la migración fuera del arranque de desarrollo, configura la conexión y ejecuta:

```powershell
./scripts/Use-LocalDatabase.ps1
dotnet ef database update --project backend
```

El arranque en producción no migra ni agrega seed automáticamente. El estado actual está en [docs/near-zero-deployment.md](docs/near-zero-deployment.md); los documentos Azure SQL anteriores son históricos. GitHub Actions compila, prueba con SQL aislado y publica imágenes en GHCR; no despliega automáticamente. El Dockerfile multi-stage sirve React y API en el puerto 8080. El helper `scripts/azure/update-cosmos-image.ps1` actualiza una imagen por digest conservando la configuración actual. El deploy SQL/ACR antiguo rechaza modificar una aplicación Cosmos. No ejecutar scripts de destroy históricos sobre los recursos conservados para rollback.

## Siguiente iteración propuesta

1. Edición de registros y paginación/filtros por fechas.
2. Afinar la captura de ritmos como `mm:ss` y laps en una tabla editable.
3. Agregar pruebas automatizadas de navegador y más casos de consistencia entre métricas.
4. Probar restauración PITR de Cosmos y vigilar las cuotas compartidas de Azure.

Garmin, importación de archivos deportivos, IA y analytics avanzados quedan fuera de esta iteración. La importación de JSON pegado sí está disponible.

## Evaluación de infraestructura — noviembre de 2026

El [release v0.1.0](https://github.com/crosbostol/Trazo/releases/tag/v0.1.0)
conserva el código anterior a la evaluación de Cosmos DB, con bundle Git verificado
y una referencia de configuración Azure sin secretos. No incluye un backup de la base.

La primera respuesta HTML desde ACA en cero y SQL pausado tardó 77,077 segundos
en la medición del 08-11-2026. Durante la evaluación inicial se probó Cosmos por separado con datos
ficticios. Esa etapa precedió a la migración de producción completada el mismo día. Resultados, costos,
límites y pasos pendientes en [el informe de viabilidad](docs/cosmos-feasibility-20261108.md);
instrucciones reproducibles en [experiments/cosmos-spike](experiments/cosmos-spike/README.md).

La migración a Cosmos Free Tier + GHCR retiró ACR y la espera de reanudación de SQL.
Después se eligió mantener una réplica ACA encendida para evitar el arranque
observado de 36 segundos en una muestra; costo idle estimado el 08-11-2026 de USD 4–6/mes según cuotas, más uso
activo. [Estado actual, pruebas, costos y rollback](docs/near-zero-deployment.md).
