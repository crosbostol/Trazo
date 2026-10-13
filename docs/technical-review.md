# Revisión técnica del MVP — 22 de septiembre de 2026

Alcance: modelo, API, dashboard, seed, configuración, README y las cinco verificaciones solicitadas. No se agregaron pantallas, autenticación, servicios externos ni infraestructura Azure. La pasada inicial del 21 de septiembre pasó las cinco verificaciones existentes; los problemas de esta revisión no estaban cubiertos por aquellas pruebas.

## Hallazgos corregidos

1. **Actividades incompletas y métricas contradictorias.** La API admitía Running sin detalles, Strength sin ejercicios, ejercicios sin sets, FC cero, medias superiores a máximos, tiempos acumulados mayores al total y laps sin mediciones. Ahora devuelve `400` con errores de validación. Se validan también valores finitos, texto sin NUL, lados, identificadores ordinales únicos, calorías y rangos de altitud. No se impone un máximo deportivo a FC/potencia/cadencia. Altitudes bajo el nivel del mar y potencia/cadencia cero siguen siendo válidas. La API no hace detección de outliers fisiológicos.
2. **Integridad dependiente exclusivamente del frontend/API.** Nuevas migraciones agregan checks de signos, finitud, enums, sensaciones, límites de training effect, coherencia de mínimos/máximos y sets en PostgreSQL. No se modificó la migración inicial ni se corrigieron registros históricos silenciosamente. Una instalación con datos que violen los checks debe revisarlos antes de aplicar las migraciones.
3. **Reinserción de seed.** Antes se ejecutaba por defecto y dependía solo de que dos tablas estuvieran vacías. Ahora está deshabilitado por defecto; exige opt-in, Development y una base separada con sufijo `_demo`. `SeedHistory` persiste tras borrar actividades/mediciones y un bloqueo transaccional evita carreras entre procesos. La migración bloquea el seed en instalaciones que ya tengan registros.
4. **Pérdida de precisión del payload en el navegador.** `JSON.parse` seguido de `JSON.stringify` redondeaba enteros grandes y podía convertir números fuera del rango de JavaScript a `null`. El formulario ahora envía el texto validado intacto. El detalle usa `rawPayloadJson` para mostrar números sin pérdida. PostgreSQL comprueba representabilidad JSONB y devuelve `400` ante NUL, Unicode inválido o números fuera de su rango, sin truncarlos ni sustituirlos.
5. **Carga innecesaria de datos personales en el dashboard.** La consulta cargaba entidades completas con JSONB y devolvía el payload de la última actividad. Ahora proyecta solo campos usados por la pantalla y el cálculo; las fórmulas no cambiaron.
6. **Errores distintos según entorno.** Se hizo explícito el manejo de JSON inválido para responder Problem Details `400` tanto en Development como en Production.
7. **Versionado transitorio de EF.** La referencia privada a Design elevaba EF a 10.0.5 solo en la API, pero sus consumidores recibían 10.0.0. Se fijó la dependencia de runtime Relational 10.0.5 para que el proyecto de pruebas consuma la misma versión.
8. **Limpieza de procesos de pruebas.** Al incorporar la prueba de Production se detectó una espera duplicada sobre un proceso ya terminado por señal. Se corrigió la comprobación de `signalCode`; la pasada final termina con código cero y libera su puerto y bases temporales.

## Modelo para años de historial

| Aspecto | Resultado |
|---|---|
| Relaciones | Activity es la entidad común; RunningDetails tiene PK/FK única, laps dependen de ella, ejercicios de Activity y sets de ejercicios. No hay relaciones invertidas ni detalles compartidos. |
| Índices | Existen índices de fecha para actividades/mediciones. Las PK/índices compuestos de laps, ejercicios y sets cubren sus FK y su orden. No falta un índice de FK. |
| Índices futuros | El índice de fecha es razonable para un historial personal. Un compuesto `(Date, CreatedAt, Id)` puede ayudar al paginar con cursor; no se añadió sin esa consulta ni mediciones de rendimiento. No se necesita GIN de JSONB mientras no se consulte su contenido. |
| Constraints | Checks locales agregados; se conservan PK, FK y unicidad de orden/set/lap. La API valida presencia de hijos, compatibilidad deporte/detalles, duración del padre y sumas de laps. SQL directo todavía puede eludir esas reglas entre tablas. |
| Tipos | UUID, enteros para segundos/contadores, `date`, `timestamptz`, JSONB y doubles son adecuados. Los doubles producen residuos binarios normales en sumas; pasar todo a `numeric` sería una decisión de precisión/unidades, no una corrección obligatoria. |
| DateOnly/UTC | La fecha de entrenamiento es un día local suministrado por el usuario: no se convierte a UTC. Los timestamps de auditoría se crean en UTC y se almacenan como `timestamptz`. Este tipo conserva el instante, no la zona IANA. |
| Cascadas | Borrar Activity elimina solo sus detalles, laps, ejercicios y sets. No elimina mediciones corporales, otras actividades ni SeedHistory. La pérdida definitiva es propia del DELETE actual, que la UI confirma; no se introdujo soft delete. |
| Escala | El dashboard carga solo 12 semanas, pero actividades y mediciones siguen devolviendo todo el historial. Esa es la principal deuda de crecimiento; no se implementó paginación porque sería ampliar el contrato. |

Las restricciones entre tablas podrían reforzarse con triggers diferidos o un diseño con discriminadores compuestos. Implican duplicación de reglas o mayor complejidad de escritura. No se introdujeron: hoy hay una sola API escritora; habría que decidirlo antes de habilitar importadores o procesos que escriban directamente.

## Cálculos del dashboard comprobados

| Regla | Comportamiento |
|---|---|
| Semana | Lunes inclusive hasta lunes siguiente exclusivo; la semana actual queda cortada en hoy, por excluir futuro. El domingo pertenece al lunes anterior. |
| Últimos 30 días | Desde `hoy - 29` hasta hoy inclusive; son días de calendario, no 720 horas exactas. |
| Distancia | Solo Running; distancia ausente aporta cero a la suma, no se convierte en una medición almacenada. |
| Ritmo | `Σ(ritmo × distancia) / Σ(distancia)`, solo con ambas métricas positivas. Sin registros elegibles devuelve `null`. |
| FC | Promedio simple de FC media por carrera registrada. No está ponderado por duración ni representa una media de muestras del sensor. |
| Nulls | No se inventa ritmo/FC. La serie semanal incluye ceros sin carreras; la serie de ritmos omite valores ausentes. |
| Futuro | Excluido de conteos, agregados, series y última actividad. Se permite almacenarlo y sigue visible en el listado. |
| Zona | `America/Santiago`, configurable; las pruebas cubren cambio de día UTC/local, lunes/domingo y transiciones del 5 de abril y 6 de septiembre de 2026. |

No se encontró un error en las fórmulas temporales originales. `TimeProvider` se inyectó exclusivamente para probarlas de manera determinista; no se agregó una opción pública para modificar el reloj.

Los laps pueden ser parciales. Sus sumas no deben superar el total disponible, admitiendo el error acumulado de redondeo de cada dato y el total a segundos y 0,01 km. No se exige igualdad exacta entre ritmo informado y duración/distancia: Garmin puede usar bases de tiempo diferentes.

## Seed y datos históricos

Las nuevas demos se crean únicamente en una base separada seleccionada explícitamente. Las demos anteriores **siguen en `progress` si ya estaban allí** y se reconocían solo por notas; no existe una clasificación histórica infalible. No se borraron ni reclasificaron automáticamente. Revisar esa base o comenzar una base real limpia antes de incorporar datos personales definitivos. La aplicación tampoco puede impedir que el usuario registre datos reales manualmente dentro de una base demo: la conexión elegida define la separación.

## Seguridad básica

- No se encontró una credencial de producción en los archivos examinados. Las contraseñas presentes corresponden al PostgreSQL local de Compose y pruebas. El directorio no tiene `.git`: no es posible afirmar qué fue commiteado anteriormente ni revisar un historial de secretos.
- PostgreSQL se publica en `127.0.0.1:5432`, no en todas las interfaces. Vite también escucha en loopback. No se modificó la exposición de red.
- Production no ejecuta migraciones ni seed, aunque se pasen sus flags como `true`; tampoco publica OpenAPI. Se verificó en un proceso Production contra una base vacía. Necesita conexión externa explícita, porque la cadena incluida es solo de Development.
- No hay CORS permisivo. El frontend usa `/api` con proxy local de Vite; dos orígenes distintos en Azure requerirían definir un origen/base URL y una política precisa. CORS no sustituye autenticación ni protege contra clientes HTTP directos.
- No hay HTTP body logging ni `EnableSensitiveDataLogging`. Los parámetros SQL están ocultos. Una prueba comprueba que un payload con un valor centinela no aparece en logs. Esto no sustituye revisar la telemetría/proxy del futuro hosting.
- `.env.*` y configuraciones locales adicionales quedaron ignoradas. Los secretos reales deben permanecer fuera del repositorio y de los logs.
- La API sigue sin autenticación, como se solicitó, y el usuario de PostgreSQL de Compose tiene permisos amplios adecuados solo para desarrollo. No está lista para exposición pública de datos personales.

## Discrepancias y ajustes del README

- Se actualizó el arranque: el seed ya no es automático. Se agregaron instrucciones de demo aislada y retorno a la conexión habitual.
- Se corrigió la afirmación demasiado amplia de conservación del payload: JSONB no mantiene formato, orden ni claves duplicadas y tiene límites de representación. Además, la captura anterior perdía precisión antes de llegar al servidor.
- Se documentaron las nuevas validaciones, la diferencia entre checks SQL y reglas de API y el riesgo de datos históricos inválidos al aplicar la migración.
- Se explicitó que la semana actual llega hasta hoy, la media de FC es por sesión, hay listados sin paginación y Production requiere configuración de conexión.
- La aplicación conserva todos los endpoints y pantallas originales. OpenAPI es un documento JSON; nunca hubo UI Swagger adicional.

## Deuda técnica priorizada

**Debe corregirse antes de Azure**

1. Definir acceso privado/autenticación antes de exponer datos personales; no se implementó en esta revisión.
2. Configurar secretos externos, TLS, red privada de PostgreSQL, roles separados de runtime/migración, backups y prueba de restauración. No reutilizar credenciales o privilegios de Compose.
3. Separar/revisar datos reales y demos del MVP anterior; verificar integridad antes de migrar otra instalación.
4. Definir mismo origen o CORS/base URL explícitos y el procedimiento de migración de producción. `AllowedHosts: "*"` requiere decisión según el ingress/host elegidos.

**Conviene corregir pronto**

1. Paginación y filtros de fechas para no enviar años de actividades/mediciones en cada listado; después medir si hace falta un índice compuesto.
2. DTO independiente para RunningDetails: actualmente el request reutiliza el modelo, aunque sus IDs se sobrescriben y se valida el deporte. Separarlo mejora evolución del contrato; no era necesario para resolver integridad hoy.
3. Pruebas automatizadas de interfaz. El helper que conserva JSON tiene cobertura, pero los flujos completos de navegador no están automatizados.
4. Si aparecen otros escritores, reforzar invariantes entre tablas en PostgreSQL. No permitir escrituras directas de importadores sin esa decisión.

**Puede esperar**

1. Conversión general de doubles a decimal/numeric, particionado, índices GIN, materializaciones o analítica avanzada: no hay una necesidad medida.
2. Soft delete, auditoría extendida y actualización automática de `UpdatedAt` cuando exista edición. Hoy el endpoint de edición no existe.
3. Definir límites de detección de anomalías fisiológicas y semántica exacta de cada métrica del proveedor; no introducir topes deportivos arbitrarios.

## Verificaciones y referencias

La batería obligatoria está en README. `node tests/api-smoke.mjs` ejecuta además las regresiones nuevas de API, Production y `tests/ReviewChecks`, con bases aisladas y limpieza al terminar. No necesita instalar librerías de pruebas adicionales.

Resultado final del 22 de septiembre de 2026:

| Comando | Resultado |
|---|---|
| `dotnet build backend` | Exit 0; 0 errores, 0 advertencias |
| `dotnet ef migrations has-pending-model-changes --project backend` | Exit 0; modelo sincronizado |
| `npm --prefix frontend run build` | Exit 0 |
| `npm --prefix frontend run lint` | Exit 0 |
| `node tests/api-smoke.mjs` | Exit 0; todas las regresiones pasaron |

Las auditorías de NuGet (incluidas transitivas) y npm (dependencias de producción) no reportaron vulnerabilidades conocidas en sus fuentes actuales. Las dos migraciones nuevas se aplicaron a la base local `progress`; conserva 36 actividades y 12 mediciones, con una marca de seed. La suite no deja bases `progress_test_*` ni un listener en 5144.

Referencias de semántica: [JSONB en PostgreSQL](https://www.postgresql.org/docs/17/datatype-json.html) y [mapeo DateOnly/UTC en Npgsql](https://www.npgsql.org/doc/types/datetime.html). Las conclusiones sobre configuración y endpoints provienen del código y las pruebas locales, no de una auditoría del futuro deployment.
