# Persistencia de Trazo: comparación y recomendación

> Documento histórico: conserva decisiones, mediciones y resultados de su etapa original. No describe la producción actual ni autoriza repetir el provisioning o deployment. Consulta el [estado vigente](near-zero-deployment.md) y el [índice de documentación](README.md).

Fecha: 25-09-2026. Solo análisis; no se migró ni se modificó infraestructura.
El deployment sigue pausado por el usuario. Estado recuperable en
[azure-deployment-status.md](azure-deployment-status.md).

## Recomendación

Mantener PostgreSQL para terminar y usar el MVP, si se acepta su costo fijo de
USD 18,18/mes de persistencia. Trazo sí encaja bien en documentos: no hay un
impedimento de dominio que obligue a usar SQL. Cosmos DB Serverless sería mi
alternativa NoSQL si minimizar el gasto mensual personal pasa a ser prioritario.
No migraría a Table Storage como base principal: ahorra dinero de infraestructura
pero traslada consultas, integridad y recuperación al código.

Reconsiderar después de unas semanas de uso real y antes de pagar sin créditos.
Si USD 18/mes ya es inaceptable a largo plazo, decidirlo ahora evita introducir
datos reales que luego habrá que migrar; eso justificaría una prueba pequeña de
Cosmos, no una migración inmediata ni un cambio por moda.

## Lo que realmente hace el código

- `backend/Services/DashboardService.cs`: obtiene una proyección de las últimas
  12 semanas, terminando hoy según America/Santiago. No trae rawPayload ni laps/sets.
  Los agregados semanales, ritmo y FC se calculan en C#; además consulta el total
  histórico hasta hoy y la última actividad. Son aproximadamente tres consultas
  de base por dashboard, no un motor analítico ni agregaciones entre usuarios.
- Semana desde lunes; últimos 30 días = hoy y los 29 días anteriores. Excluye
  actividades futuras. Ritmo = suma(ritmo × distancia) / suma(distancia), solo
  donde ambos valores son positivos. FC = media aritmética de FC medias positivas,
  no ponderada por distancia ni duración. Sin muestras válidas, devuelve null.
- `backend/Endpoints/ApiEndpoints.cs`: el detalle carga Running/laps o ejercicios/
  sets mediante EF y consultas divididas. Crear/eliminar opera sobre la actividad
  completa. No hay catálogo compartido de ejercicios que requiera joins externos.
- Los listados actuales de actividades y mediciones no tienen paginación ni
  ownership por usuario. La comparación de 100/1.000 usuarios supone implementar
  ese aislamiento en cualquier proveedor; no ejecutar las consultas globales
  actuales como si ya fueran multiusuario.
- `ProgressDbContext.cs`: índices por fecha, claves foráneas, cascades, CHECKs,
  unicidad de número/orden de laps, ejercicios y sets. Parte de la integridad entre
  tipo de actividad y detalles ya se valida en `RequestValidation`, no toda en DB.
- `tests/api-smoke.mjs`: exige conservar `9007199254740993` y `1e400` en rawPayload.
  Esta precisión es parte del comportamiento, no una preferencia de almacenamiento.
- PostgreSQL también guarda **DataProtectionKeys**. Quitar PostgreSQL exige mover
  esas claves persistentes para que las cookies sobrevivan a reinicios y escala cero.

## Supuestos de costos

USD, Central US, pago por uso, sin impuestos/descuentos/créditos; tarifas Retail
API consultadas en esta fecha. ACR permanece en East US 2. No se provisionó ninguna
alternativa para medirla. RUs son estimaciones, no resultados de un benchmark.

Escenario de usuario activo ligero: 20 actividades y unas 12 mediciones al mes,
60 aperturas de dashboard, 120 consultas de listados/historial, 100 detalles,
hasta 50 escrituras/borrados. Una actividad media de 20 KB incluyendo rawPayload;
cinco años son 1.200 actividades. Reservo **50 MB facturables por usuario**, con
índices/metadatos/margen: 0,05 / 5 / 50 GB para 1 / 100 / 1.000 usuarios.
No son datos medidos; rawPayload de 1 MB en vez de 20 KB cambia drásticamente el resultado.

Cosmos: sensibilidad de **20.000–200.000 RU/usuario/mes**, incluyendo consultas,
escrituras y margen operativo, con partición por usuario, índices adecuados y sin
indexar rawPayload. El historial completo sin paginar puede aumentar RUs; medir
también el COUNT histórico, probes y llamadas repetidas, no solo point reads.
Table: presupuesto de 1.000 operaciones facturables/usuario/mes, considerando
continuaciones. Los scans y un backup propio pueden aumentar ese número.

### Tarifas unitarias consultadas

| Servicio | Fijo/cómputo/requests | Datos |
|---|---|---|
| PostgreSQL Flexible B1ms | 0,01921 USD/h × 730 = 14,02/mes | 32 GB × 0,13 = 4,16/mes |
| Cosmos NoSQL Serverless | 0,282 USD por millón de RU; sin mínimo RU/s | 0,25 USD/GB-mes, incluidos índices |
| Table Storage Standard LRS | 0,00036 USD/10.000 operaciones en los medidores consultados | 0,045 USD/GB-mes |
| Azure SQL Basic, 5 DTU | 0,161 USD/día × 30,44 = 4,90/mes | 2 GB incluidos, límite pequeño |
| Azure SQL S0, 10 DTU | 0,4839 USD/día × 30,44 = 14,73/mes | hasta 250 GB incluidos |
| Azure SQL S1, 20 DTU | 0,9677 USD/día × 30,44 = 29,46/mes | hasta 250 GB incluidos |
| Azure SQL GP Serverless Gen5 | 0,62611 USD/vCore-h activo facturable | se cobra aparte, salvo oferta gratuita |

Fuente de tarifas: [Azure Retail Prices API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices).
Consulta reproducible: serviceName y armRegionName='centralus', priceType='Consumption';
productos `Azure Cosmos DB serverless`, `Tables`, `SQL Database Single Basic`,
`SQL Database Single Standard`, `Azure Database for PostgreSQL Flexible Server
Burstable BS Series Compute` y `Azure Database for PostgreSQL Flex Server Storage`.
Instantánea local: `artifacts/persistence-prices-centralus.json`.

Table usa aquí cifrado estándar administrado por Microsoft, no datos sin cifrar.
El modo de clave a nivel de cuenta tiene otros medidores: 0,0554 USD/GB-mes,
lecturas 0,00615/10K, escrituras 0,0308/10K, listados/scans 0,111/10K. No mezclar
esos precios con los de Standard. [Distinción oficial de cifrado/facturación](https://learn.microsoft.com/azure/storage/common/account-encryption-key-create).

### Persistencia mensual estimada, separada de hosting

| Alternativa | 1 usuario | 100 usuarios | 1.000 usuarios |
|---|---:|---:|---:|
| PostgreSQL B1ms | 18,18 | 18,18, si B1ms alcanza | desde 22,34 con B1ms + 64 GB; posible aumento de compute |
| Cosmos Serverless | 0,02–0,07 | 1,81–6,89 | 18,14–68,90 |
| Table Standard LRS | ~0,003 | ~0,23 | ~2,29 |
| Azure SQL DTU | Basic ~4,90 | S0 ~14,73 | S0 ~14,73 o S1 ~29,46+, según pruebas |

Precios de almacenamiento + operaciones/cómputo; **no equivalencia automática de
rendimiento ni cobertura de backup**. PostgreSQL y SQL podrían requerir más compute
por concurrencia, memoria o créditos de CPU, no por el número de cuentas en sí.
En 1.000 usuarios se usa 64 GB para PostgreSQL porque 50 GB no caben en 32 GB.
Table no incluye implementar/operar exportaciones de respaldo ni eventuales blobs
para documentos grandes. Las cifras de centavos son costo teórico de medidores,
no una factura final prometida.

Fórmula Cosmos: `RU/1.000.000 × 0,282 + GB × 0,25`.
Con 50 GB, solo datos cuestan 12,50/mes; a 100 millones de RU/mes suma 28,20.
No es siempre más barato que SQL. Con este escenario, el cruce contra B1ms+64 GB
se produce aproximadamente en 35 millones de RU/mes, antes de diferencias operativas.

Costos comunes: ACR ~5,07/mes y Container Apps ~0–5/mes para uso personal, que no
desaparecen al cambiar DB. No extrapolar 0–5 a 1.000 usuarios sin medir hosting.
Para una persona, totales orientativos: PostgreSQL ~23–28; Cosmos ~5–10;
Table ~5–10 más backup propio; SQL Basic ~10–15. El ahorro de Cosmos frente a
PostgreSQL es principalmente ~18/mes, no todo el costo de Trazo.

Backups: PostgreSQL incluye hasta el almacenamiento provisionado; exceso se cobra.
Cosmos tiene backup periódico con dos copias incluidas o continuo de 7 días sin
cargo de almacenamiento de backup; restore/retención ampliada pueden cobrar.
SQL DTU incluye backup PITR estándar dentro de las condiciones del tier; LTR y
destinos adicionales no se suponen gratis. Table no ofrece PITR nativo equivalente.
Fuentes: [Cosmos precios/backup](https://azure.microsoft.com/pricing/details/cosmos-db/serverless/),
[PostgreSQL backup](https://learn.microsoft.com/azure/postgresql/backup-restore/concepts-backup-restore),
[SQL backups](https://learn.microsoft.com/azure/azure-sql/database/automated-backups-overview),
[Table recuperación](https://learn.microsoft.com/azure/reliability/reliability-storage-table).

Red: se supone aplicación y DB en Central US, endpoints públicos protegidos y TLS,
sin Private Link, NAT Gateway ni tráfico constante entre regiones. No se agrega un
peaje de red fijo; egreso a Internet/otra región y descargas de backups se facturan
si corresponde. ACR en East US 2 puede generar transferencia de imágenes al desplegar,
común a las alternativas. Logs exportados, alertas de pago, restore y backups propios
son extras; métricas básicas no requieren introducir Log Analytics ni Key Vault.

## Activity como documento Cosmos

Sí: una actividad es un agregado natural, leído/borrado conjuntamente. Laps y sets
no necesitan IDs globales ni colecciones separadas solo por venir de tablas SQL.
Se pueden conservar los IDs existentes para mantener la respuesta de la API.

```json
{
  "id": "activity-uuid",
  "userId": "owner-uuid",
  "documentType": "activity",
  "schemaVersion": 1,
  "date": "2026-09-25",
  "createdAt": "2026-09-25T16:00:00Z",
  "type": "Running",
  "durationSeconds": 1800,
  "mood": 4,
  "energy": 3,
  "rpe": 6,
  "subjectiveNotes": null,
  "running": {"distanceKm": 5, "averagePaceSecondsPerKm": 360, "laps": []},
  "exercises": [],
  "rawPayloadJson": "{\"id\":9007199254740993,\"big\":1e400}"
}
```

Para Strength: `running=null`, ejercicios embebidos y `sets` dentro de cada uno.
BodyMeasurement es otro documento, con `documentType='bodyMeasurement'`, fecha,
peso y el mismo owner; nunca un array creciente dentro de un documento User.
Puede usarse un contenedor compartido `training`, `/userId`, con ambos tipos y
prefijos de id para evitar colisiones; no hace falta una transacción entre actividad
y medición corporal. Separar contenedores también sería viable, pero no aporta hoy.

**rawPayload es la excepción crítica.** Cosmos recomienda strings para números
que excedan binary64. JSONB actual conserva magnitudes/enteros fuera de ese rango.
No convertirlo a objetos con double ni mandarlo como números Cosmos esperando el
mismo resultado. Guardar el JSON como texto opaco, no indexado, y reconstruir el
contrato externo con JsonDocument sin convertir a double; conservar las reglas
actuales de JSON representable y su normalización cuando sea observable en tests.
JSONB ya normaliza espacios/orden: la garantía existente es semántica/numérica,
no identidad byte a byte del texto original. [Guía de tipos/números Cosmos](https://learn.microsoft.com/azure/cosmos-db/modeling-data).

Cada item Cosmos tiene límite de **2 MB**, incluido texto escapado/metadatos.
Un rawPayload grande requiere Blob Storage con referencia/hash o una estrategia
de fragmentación; Blob+Cosmos no tiene transacción atómica conjunta y exige
reintentos/limpieza de huérfanos. Arrays enormes también pueden exceder el límite.
No introducir un límite nuevo silenciosamente: mantener todos los payloads hoy
admitidos puede requerir más trabajo que el documento simple del ejemplo.
[Límites Cosmos](https://learn.microsoft.com/azure/cosmos-db/concepts-limits).

### Partición, índices y multiusuario

Recomendaría `/userId`: point reads y deletes reciben id + owner, y las consultas
de fecha/tipo quedan en una partición. No usar fecha sola ni activityId como PK:
fragmentaría las consultas de cada dashboard. El owner siempre deriva de la sesión,
nunca se confía en un userId pegado en /import. Particionar no reemplaza autorización.

Para un futuro usuario real, UUID estable. Si se migrara aún en modo personal,
se necesita un identificador estable del propietario y un backfill explícito;
eso no obliga a construir cuentas/OAuth ahora. Nada de esto se implementó.
50 MB por persona está muy lejos del límite lógico de 20 GB; no se justifica
`userId+mes` hoy. Evaluar `/userId,/year` jerárquica si un usuario realmente crece
cerca de ese límite o se vuelve una partición caliente. Cambiar PK exige migración.

Indexar date/type/documentType y los campos de orden necesarios. Índice compuesto
para el orden determinista date/createdAt/id, y combinaciones por tipo si el costo
medido lo justifica. Excluir rawPayloadJson y campos anidados sin consultas; devolver
proyecciones pequeñas. No indexar cada campo de laps/sets por costumbre.
[Políticas de índices](https://learn.microsoft.com/cosmos-db/indexing-policies).

## Consultas concretas

| Necesidad | PostgreSQL actual | Cosmos | Table Storage |
|---|---|---|---|
| Fecha/rango/tipo | WHERE e índices; filtro tipo actual puede completarse sin cambiar modelo | WHERE con PK userId, rangos ISO y filtro type | PK userId + rango RowKey; filtro tipo no tiene índice secundario |
| Última actividad | ORDER BY fecha/creación/id, límite 1 | TOP 1 y ORDER BY con índices compatibles | RowKey temporal inversa para acceder primero a la última; claves auxiliares para id |
| Semana/30 días/distancia | Proyección y sumas C# | Misma proyección pequeña y sumas C#, o SUM | Recuperar filas del rango y sumar en C# |
| Ritmo y FC | Fórmulas actuales en C# | Reutilizar fórmulas, tratamiento explícito de null/undefined | Reutilizar fórmulas; propiedad ausente se traduce a null |
| Total histórico | COUNT hasta hoy | COUNT por owner; medir RUs por crecimiento | Sin COUNT agregado equivalente: leer/claves o contador consistente propio |
| Peso | Tabla con fecha | Documentos de medición por owner y fecha | Tabla/entidades de peso por owner + RowKey de fecha |
| Detalle | Include/AsSplitQuery sobre hijos | Un point read de Activity | Una entidad serializada si cabe; varias/Blob si se fragmenta |
| Delete | Cascade transaccional | Delete del documento elimina hijos embebidos | Borrar entidad y auxiliares/Blob; coordinar consistencia |
| Importar JSON | Validación + SaveChanges | Misma validación, mapper, create de item atómico | Validación + serialización + batch cuando corresponda |

No hacen falta joins entre documentos para las consultas listadas. JOIN de Cosmos
sobre arrays no equivale a un join relacional entre items; no lo necesitamos aquí.
La fecha deportiva debe seguir como `YYYY-MM-DD`, separada de createdAt/updatedAt UTC.
America/Santiago y las reglas de exclusión de futuros permanecen en el servicio,
no se reemplazan por el día UTC del proveedor.

Table solo indexa PartitionKey/RowKey. Diseñar una RowKey por fecha inversa facilita
rangos y último registro, pero `/api/activities/{id}` necesitaría un índice id→RowKey
o una consulta extra; una RowKey=id hace lo contrario. Mantener ambas copias exige
transacciones/ETags y pruebas. Los batches tradicionales están limitados a una
partición; no asumir atomicidad con blobs. No agregar un contador materializado
sin necesidad medida, porque suma una nueva fuente de inconsistencias.
[Consultas Table](https://learn.microsoft.com/azure/storage/tables/table-storage-design-for-query).

Además Table limita una entidad a 1 MiB y strings/binary a 64 KiB por propiedad
(string UTF-16: alrededor de 32K caracteres). No soporta arrays/documentos anidados
como propiedades; hay que serializar, fragmentar o usar blobs. Null se representa
como propiedad ausente. Es un mal ajuste para rawPayload arbitrario y sets/laps
extensos. [Modelo y límites Table](https://learn.microsoft.com/rest/api/storageservices/understanding-the-table-service-data-model).

## Integridad, operación y testing

| Aspecto | PostgreSQL | Cosmos Serverless | Table Storage | Azure SQL |
|---|---|---|---|---|
| Integridad | FK/CHECK/UNIQUE/cascades + validación C# | Item atómico, id/PK y unique keys dentro de partición; sin FK/CHECK equivalentes | PK/RowKey/ETag; validación y coherencia auxiliares en código | Conserva FK/CHECK/UNIQUE, adaptando expresiones SQL |
| Concurrencia | Transacciones relacionales | ETag/If-Match para evitar pérdida de updates; batch tradicional por partición | ETag y batches limitados; blobs por separado | Transacciones relacionales |
| Backup/restore | PITR administrado + pg_dump portable; restore crea servidor, no restore individual instantáneo | Continuo 7 días o periódico; ensayo de restore a otra cuenta/item según capacidad; no equivalente a pg_dump | Exportación propia; réplica LRS no protege de borrado lógico | PITR administrado, tier/retención; restore a otra DB |
| Observabilidad | SQL lento, planes, conexiones, memoria, CPU/créditos | RU por operación, 429/reintentos, índices, partición y latencia | páginas leídas, scans, requests, inconsistencias de índices/backup | Query Store, DTUs/vCores, tiempos y consumo libre |
| Lock-in | Bajo: Npgsql/JSONB específico de PostgreSQL pero portable fuera de Azure | Alto: SQL Cosmos, PK, RU, ETag, índices y backups | Medio-alto: tablas/RowKey/SDK/semántica Azure | Intermedio: SQL Server/EF portable al motor, servicio Azure reemplazable |

El documento embebido gana integridad estructural: no quedan laps huérfanos tras
borrar Activity. Aun así no impide insertar sets negativos o números duplicados
dentro de arrays por fuera de la API. Se mantienen y amplían validaciones C#;
quitar CHECKs no se compensa solo con una clase tipada.

Reutilizar pruebas de dominio, timezone, promedios, nulls, importación y contrato HTTP.
Reemplazar pruebas de FK/CHECK/migraciones por pruebas específicas del nuevo store.
Cosmos necesita tests reales de límites/tamaño/precisión, aislamiento PK, ETag,
reintentos 429 y RUs; emulador no basta para costo/rendimiento. Table: Azurite más
integración real, continuaciones, índices auxiliares y restore. SQL: integración
con SQL Server/Azure SQL, sin asumir que EF InMemory reproduce constraints.

Con NoSQL, DataProtectionKeys debería moverse a un Blob privado usando el proveedor
oficial ASP.NET, reutilizando la identidad y restringiendo permisos al contenedor.
Su volumen es mínimo, pero requiere probar sesiones tras cold start/rotación y
respaldar claves. No conservar una instancia PostgreSQL solo para esas claves:
eliminaría el ahorro. [Proveedor oficial de claves](https://learn.microsoft.com/aspnet/core/security/data-protection/implementation/key-storage-providers?view=aspnetcore-10.0).
Revisar readiness: no traducir cada comprobación a un scan costoso o una consulta
que impida auto-pause en SQL Serverless. No loguear payloads, tokens ni claves.

## Otras opciones realmente razonables

**Azure SQL Basic** es la alternativa barata con menor cambio conceptual: mantener
EF Core/relaciones y guardar rawPayload como texto JSON (`nvarchar(max)` + validación),
sin convertir números a float. Hay que adaptar Npgsql, JSONB, casts Infinity,
funciones SQL, migraciones y normalización de rawPayload. No es cambiar una línea
de connection string. Basic limita a 2 GB; para el escenario de 100 usuarios con
5 GB se presupuestó S0. S0/S1 tampoco garantizan capacidad para 1.000 usuarios sin
prueba de carga. [Tiers SQL](https://azure.microsoft.com/pricing/details/azure-sql-database/).

**Azure SQL Serverless Free**: ofrece por DB 100.000 vCore-segundos, 32 GB de datos
y 32 GB de backup mensuales, hasta 10 DB por suscripción. No asumir elegibilidad/
disponibilidad regional sin comprobarla. Para 1 usuario podría ser USD 0 si entra
en la franquicia; para 100/1.000 no se puede deducir del número de usuarios. El modelo
de 50 GB a 1.000 ya supera 32 GB. Auto-pause tarda al menos 15 minutos; conexiones
abiertas/probes pueden impedirlo. Al agotar franquicia se elige pausa hasta el mes
siguiente o pago adicional. No prometer servicio continuo gratis. Fuera de oferta,
0,5 vCore facturable × 730 h × 0,62611 = ~228,53/mes de compute si nunca duerme,
antes de storage: serverless no significa siempre barato.
[Oferta](https://learn.microsoft.com/azure/azure-sql/database/free-offer),
[billing/auto-pause](https://learn.microsoft.com/azure/azure-sql/database/serverless-tier-overview).

**Cosmos aprovisionado Free Tier** también merece comprobarse si se decide migrar
a Cosmos: 1.000 RU/s y 25 GB gratuitos, con las condiciones de la oferta y una cuenta
elegible por suscripción. Es diferente de Serverless, que no recibe ese descuento.
No se sumaron ambos beneficios ni se supuso que la suscripción lo tenga libre.
[Free Tier Cosmos](https://learn.microsoft.com/azure/cosmos-db/free-tier).

No propondría PostgreSQL en VM ni SQLite en disco efímero de Container Apps para
ahorrar: el primero transfiere administración/backup al usuario; el segundo pierde
persistencia. SQLite sobre un filesystem remoto y escalado concurrente añade
problemas de locking y recuperación. Blob como única DB obliga a reconstruir los
índices/transacciones; úsese para payloads/backups si hace falta, no para reinventar
la persistencia completa. No son mejores alternativas para este MVP.

## Esfuerzo de cambio y qué se reutiliza

Horas de ingeniería orientativas para alguien que conozca el repositorio, incluyendo
pruebas/documentación y sin implementar usuarios/OAuth. No son una cotización.

| Decisión | Esfuerzo aproximado |
|---|---|
| Mantener PostgreSQL | 0 h de migración; terminar el deployment pendiente es trabajo separado |
| Cosmos Serverless | 40–72 h; añadir 16–32 h si hay que soportar payloads grandes con Blob y reconciliación |
| Table Storage | 56–96 h; índices auxiliares, fragmentación y backup/restore explican el mayor esfuerzo |
| Azure SQL Basic/Free | 24–48 h; menor cambio de dominio, pero reescritura y pruebas del SQL/JSON específicas |

Capas/archivos afectados: `ProgressDbContext.cs`, `ApiEndpoints.cs`, consultas de
`DashboardService.cs`, `Program.cs` (DI, claves de sesión, health y comandos DB),
`Progress.Api.csproj`, modelos de persistencia/mappers, migraciones y `DemoSeed`,
scripts Azure, configuración, README y smoke/integración. Hay validación específica
de PostgreSQL en `RequestValidation.cs`; preservar el contrato requiere separarla
con cuidado de las reglas deportivas.

Reutilizable: DTO de POST, reglas de dominio, escalas subjetivas, cálculos dashboard,
timezone, la mayor parte del frontend, /import y su serialización precisa,
cookie auth/CSRF, rutas HTTP y pruebas de contrato. Los endpoints hoy dependen de
DbContext, por lo que no basta intercambiar el proveedor. Una abstracción pequeña
de operaciones Activity/Body/consultas sería suficiente si se migra; no se refactorizó
ahora ni se propone un framework genérico de repositorios.

Dominio/API pueden permanecer prácticamente iguales. El formato físico de rawPayload
puede ser texto/Blob internamente, pero las respuestas y `rawPayloadJson` deben
mantenerse. IDs, orden de arrays, fechas, nulls y errores legibles deben tener tests
de regresión. Riesgos mayores: pérdida numérica, cambios de límites admitidos,
propietario equivocado, errores por null/undefined, pérdida de sesiones al mover
claves y backups imposibles de restaurar.

## Cuándo reconsiderar

- Ahora: decidir si se acepta el fijo de PostgreSQL. La DB real todavía no existe;
  cambiar de decisión aquí no requiere migrar entrenamientos reales.
- Tras 2–4 semanas de MVP: medir tamaño real/p95/máximo de rawPayload, consultas por
  día y tiempos. Si se evalúa Cosmos, prueba acotada con RequestCharge y round-trip
  de precisión; no migrar basándose solo en el costo de un point read de 1 KB.
- Antes de pagar fuera del crédito: comparar ahorro anual de ~USD 218 en DB con
  40–72+ horas de cambio. Si el tiempo vale 25 USD/h, 40 h tardan ~55 meses en
  recuperarse solo con ese ahorro; puede justificarse por presupuesto mensual,
  aprendizaje o preferencia operativa, no por un ahorro total inmediato.
- Alrededor de 50–100 usuarios activos: probar concurrencia/índices y cuantificar
  consumo. No hay un umbral técnico mágico que obligue a NoSQL.
- A 1.000: comparar RU mensual y datos reales contra PostgreSQL/SQL con recursos
  medidos. En este escenario Cosmos cuesta 18–69/mes; seguir con SQL puede ser más
  barato. Escalar usuarios no es por sí mismo una razón para migrar.

Decisión recomendada hoy: **mantener PostgreSQL y reevaluar antes de terminar el
crédito**, salvo que se priorice desde ya minimizar el gasto mensual personal.
En ese caso, Cosmos Serverless es el candidato NoSQL; Azure SQL Basic/Free también
merece una evaluación porque reduce costo conservando el modelo relacional.
