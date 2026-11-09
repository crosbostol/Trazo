# Cosmos DB: prueba de viabilidad del 8 de noviembre de 2026

Prueba autorizada con datos ficticios. La aplicación de producción continúa usando
SQL Server/Azure SQL y la revisión `trazo-mvp--20260927212107`. No se migraron,
leyeron ni modificaron entrenamientos reales durante el experimento.

## Checkpoint antes de empezar

- [Release v0.1.0](https://github.com/crosbostol/Trazo/releases/tag/v0.1.0), basado
  en `c0b1749078463cb5bd9241f0e5848292ab1002c5`, el mismo HEAD que `origin/main`.
- Tag anotado y publicado. Bundle adjunto con historia completa de `main` y el tag,
  comprobado con `git bundle verify`; sin refs internas de Codex.
- Archivo adjunto `azure-production-config.json` con imagen, revisión, escala,
  SKU/pausa/free de SQL y SKU/región de ACR. No contiene variables de entorno,
  connection strings, claves ni contraseñas.
- El release conserva el código y una referencia de configuración; **no es un
  backup de la base** ni una imagen de contenedor exportada. La imagen actual
  permanece en ACR. No se recompiló la versión anterior en esta máquina porque
  no tiene el SDK .NET disponible.

## Línea base observada

Antes de este experimento se comprobó mediante Azure Management que ACA estaba
en cero réplicas y SQL en `Paused`. Una solicitud GET a `/` inició el arranque.
Durante la espera, SQL pasó por `Resuming` y llegó a `Online`.

| Petición secuencial | Tiempo total |
| --- | ---: |
| Primer HTML desde reposo | 77,077 s |
| Segundo HTML, servicios activos | 0,425 s |
| Sesión anónima | 0,162 s |
| Readiness, servicios activos | 0,141 s |

Medición del 08-11-2026, alrededor de las 17:07 America/Santiago. Casi toda la
primera espera fue anterior a recibir las cabeceras HTML (77,075 s). No se midió
el render de React ni un dashboard autenticado en esa corrida. La medición no
separa la contribución individual de ACA y SQL.

El código actual precarga las claves de DataProtection desde SQL en el arranque.
Por eso servir el frontend desde el mismo proceso puede quedar esperando SQL.
Azure SQL Serverless documenta una reanudación generalmente cercana a un minuto:
[auto-pausa y reanudación](https://learn.microsoft.com/azure/azure-sql/database/serverless-tier-auto-pause-resume).

## Diseño del experimento

Código reproducible en [experiments/cosmos-spike](../experiments/cosmos-spike/README.md).
Node 24 y REST HTTPS, sin dependencias nuevas y sin integración con la aplicación.
Una cuenta temporal Cosmos NoSQL Serverless en Central US, backup periódico/local,
sin throughput provisionado ni replicación adicional. Firewall restringido a la
IP de la estación; bypass de Azure deshabilitado. Solo se usó su clave temporal,
obtenida mediante Azure CLI en memoria. No se guardaron credenciales en archivos.

Datos: 1.200 actividades históricas sintéticas, nueve fixtures y una actividad de
otro propietario. Unos 24,5 MB lógicos; payloads históricos de aproximadamente
20 KB por documento. Partición `/ownerId`; raw JSON almacenado como texto y
excluido del índice; índice compuesto por fecha, createdAt e ID.

Se probaron tres consultas para dashboard y dos para fuerza, sin descargar payloads
en las consultas analíticas. La fuerza conserva el patrón actual de leer todos los
metadatos y después los sets elegidos, por lo que su costo crece con el historial.

## Resultados iniciales

Diez repeticiones con el historial completo cargado, consultas desde Chile hacia
Central US. El dashboard usa un rango de octubre a la fecha fija 08-11-2026.

| Operación completa | Mediana aproximada | RU por operación |
| --- | ---: | ---: |
| Dashboard: agregado, última actividad y cinco recientes | 0,62 s | 11,80 |
| Progreso del ejercicio Squat: metadatos y sets | 0,64 s | 61,49 |
| Crear actividad histórica de unos 20 KB | — | 17,475 |

Crear las 1.200 actividades consumió 20.970 RU, sin reintentos 429. Estas cifras
son solicitudes directas a Cosmos, **no** tiempos de apertura de Trazo. No implican
que la URL de producción abrirá en 0,62 s después de una migración.

Tras 607 segundos sin solicitudes de datos, desde un proceso Node nuevo y sin
conexión HTTP ni token de sesión previos:

| Operación secuencial | Tiempo | RU |
| --- | ---: | ---: |
| Primera lectura puntual de fixture pequeño | 1,026 s | 1,00 |
| Dashboard del período | 1,587 s | 11,80 |
| Progreso de Squat | 0,966 s | 61,49 |
| Dashboard con todo el rango de cinco años | 1,016 s | 172,26 |

La lectura incluye DNS/TLS y red local; la obtención de credenciales mediante CLI
se realizó antes del cronómetro. El rango de cinco años muestra que las RUs
dependen del intervalo e historial: no se deben extrapolar siempre 11,80 RU.

Pasaron las doce comprobaciones de integración y cinco pruebas locales del
transporte REST. La prueba de inactividad es una muestra después de diez minutos,
no un SLA ni una prueba nocturna. La comparación con los 77 segundos anteriores
mezcla una petición completa a ACA/SQL con peticiones directas a Cosmos; el próximo
benchmark deberá usar el backend .NET dentro de ACA para medir la mejora real.

## Estimación de costos

Tarifas Retail consultadas el 08-11-2026 a las 21:06 America/Santiago:

| Medidor | Tarifa USD |
| --- | ---: |
| Cosmos Serverless, Central US | 0,282 por millón de RU |
| Cosmos almacenamiento, SKU RUs (no Free Tier) | 0,25 por GB/mes |
| ACR Basic, East US 2 | 0,1666 por día; unos 5,07/mes |
| SQL Basic, Central US, solo comparación | 0,161 por día; unos 4,90/mes |

Se seleccionaron nombre de medidor, SKU y unidad explícitos: el catálogo también
incluye filas de Free Tier y tareas de ACR a cero que no representan estos cargos.
[Azure Retail Prices API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices).

Escenario personal ilustrativo mensual: 60 dashboards del período, 30 vistas de
fuerza, 120 páginas de 50 actividades, 100 detalles, 32 escrituras y 20 borrados.
Se usan 50 MB lógicos de almacenamiento. Con las RU observadas son unas 4.997 RU,
**USD 0,0014 en operaciones + USD 0,0125 en almacenamiento = USD 0,0139/mes**,
antes del tamaño de índices y costos comunes. No es una factura ni un presupuesto
con límite garantizado; hosting, egreso, restore, impuestos y uso distinto no están
incluidos. El backup elegido para la prueba es periódico/local, no un esquema de
restauración PITR validado para la migración.

ACR sigue siendo un costo fijo considerable frente a esta persistencia. Cambiar
SQL por Cosmos no elimina ACR ni Container Apps. El SQL actual sigue dentro de su
oferta gratuita; no se convirtió a Basic ni se habilitó sobreconsumo.

GitHub Container Registry es un candidato concreto para reemplazar ACR: GitHub
documenta actualmente almacenamiento y transferencia de imágenes de contenedor
sin cargo. ACA admite otros registros, incluido GHCR. Habría que probar el pull y
el flujo de autenticación/deployment elegido y conservar la imagen actual antes
de retirar ACR. No se publicaron imágenes ni se cambió ese registro durante esta
prueba. [Facturación de GitHub Packages](https://docs.github.com/en/billing/concepts/product-billing/github-packages),
[deployment ACA/GitHub Actions](https://learn.microsoft.com/azure/container-apps/github-actions).

## Compatibilidad comprobada y trabajo pendiente

Pasaron fixtures de distancia solo Running, ritmo ponderado, FC por sesión,
ausencia de métricas, sesiones de otros deportes, exclusión de futuro y aislamiento
de propietario. También PRs/empates de fuerza, múltiples entradas por actividad,
acentos, pesos desconocidos/cero, lados y sets por tiempo. Se comprobó paginación
con continuation, borrado visible inmediatamente y conservación exacta del texto
de payload: enteros grandes, exponentes extremos, decimales, claves duplicadas y
NUL escapado.

La prueba rechaza con 413 un documento mayor que 2 MB. SQL admite payloads mayores;
ese límite impide una sustitución transparente para todos los requests actuales.
Antes de migrar se necesitaría medir tamaños reales y definir un almacenamiento
para payloads grandes, con respaldo y consistencia entre documentos y blobs.
[Límites del servicio](https://learn.microsoft.com/azure/cosmos-db/concepts-limits).

Falta portar y verificar el backend .NET, su comparación Unicode exacta, contrato
completo del dashboard/series, validación e integridad que hoy refuerza SQL,
mediciones corporales, DataProtection, autorización y restauración de backups.
Mover las claves requiere preservar el key ring existente si se desea conservar
las cookies. No basta con cambiar una connection string ni con reemplazar EF.

## Alternativa gratuita que merece revisar

Cosmos Free Tier es distinto de Cosmos Serverless: permite los primeros 1.000 RU/s
provisionados y 25 GB sin cargo, en una cuenta elegible por suscripción. No se
aplica a cuentas Serverless. La prueba usa Serverless para medir consumo por
operación y poder eliminar todo al terminar; no ocupa una cuenta Free Tier.
[Condiciones oficiales](https://learn.microsoft.com/azure/cosmos-db/free-tier).

El inventario inicial de Cosmos de esta suscripción estaba vacío. Eso hace que
Free Tier sea un candidato a verificar al diseñar una migración, no una garantía
de elegibilidad o de costo cero con cualquier configuración. Habría que limitar
capacidad/regiones, controlar almacenamiento y confirmar las condiciones de la
suscripción. No se creó ninguna cuenta provisionada para esta evaluación.

## Decisión propuesta

La prueba favorece continuar con un prototipo .NET sobre Cosmos: las consultas y
la conservación del payload pequeño son viables y el consumo observado es bajo.
El SQL actual ya cuesta cero dentro de su oferta; el motivo del cambio sería
reducir la espera de reanudación. El ahorro total adicional merece revisar ACR.

Antes de migrar: confirmar elegibilidad/configuración de Cosmos Free Tier; portar
servicios y claves DataProtection conservando el key ring; definir payloads grandes;
validar restauración y migración en una copia; desplegar un candidato aislado en
ACA y medir su arranque completo tras inactividad. Esta prueba no incluye cambiar
el tráfico de producción.
