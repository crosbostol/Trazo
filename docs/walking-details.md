# WalkingDetails · iteración local

Implementado y probado el 27 de septiembre de 2026, sin acciones Azure ni deployment.
El bloque enviado por el usuario se admite dentro de POST /api/activities:
[JSON completo listo para /import](walking-activity.example.json).
Ajusta date al día real del entrenamiento.

## Modelo final

Activity.Walking es una relación opcional 1:1. WalkingDetails usa ActivityId
(Guid / uniqueidentifier) como PK y FK, con cascada desde Activity.

| Tipo CLR / SQL | Campos |
|---|---|
| double? / float nullable | DistanceKm; AveragePaceSecondsPerKm; MovingPaceSecondsPerKm; BestPaceSecondsPerKm |
| double? / float nullable | TotalAscentMeters; TotalDescentMeters; MinElevationMeters; MaxElevationMeters |
| double? / float nullable | AerobicTrainingEffect; AnaerobicTrainingEffect; TrainingLoad |
| int? / int nullable | TotalDurationSeconds; MovingDurationSeconds |
| int? / int nullable | AverageHeartRate; MaxHeartRate; RecoveryHeartRate |
| int? / int nullable | AverageCadence; MaxCadence; Steps |
| int? / int nullable | ActiveCalories; TotalCalories; EstimatedFluidLossMl |

Las métricas desconocidas admiten null, incluida distancia, para aceptar
walking vacío igual que running. La API completa TotalDurationSeconds desde
durationSeconds, positivo y obligatorio; rechaza un total explícito distinto.
No hay laps, potencia, tiempos corriendo ni longitud de zancada.

Nuevas actividades Walking requieren walking, al menos {}. Otros tipos lo
rechazan. Walking rechaza running y ejercicios. Las caminatas antiguas sin
detalles siguen siendo legibles y eliminables.

Reglas equivalentes a Running: números finitos; no negativos salvo altitudes;
ritmos y FC positivos cuando se informan; media ≤ máximo en FC/cadencia;
altitud mínima ≤ máxima; calorías activas ≤ totales; duración en movimiento ≤
total. Steps es entero no negativo. Training Effect usa la escala existente
0–5. No hay máximos fisiológicos arbitrarios. RecoveryHeartRate se conserva
tal como se envía (32 en el ejemplo), sin derivarlo ni reinterpretarlo.

SQL protege métricas y sus relaciones con CHECK; float rechaza NaN/Infinity.
La PK/FK impide duplicados y huérfanos. Como en Running, correspondencia entre
tipo y detalles e igualdad de duración con Activity se validan en API, sin triggers.

## Migración

20260927185410_AddWalkingDetails crea únicamente la tabla, PK/FK y CHECKs.
No modifica ni elimina filas existentes ni extrae datos históricos del payload.
El test de actualización parte del esquema SQL original con Running y Walking,
aplica Other + Walking y verifica registros, relaciones y payloads conservados.

Ambas migraciones se aplicaron en Azure, en orden, el 27 de septiembre de 2026.
Los seis registros existentes, sus 23 ejercicios, 67 sets y su fingerprint se
conservaron. Revertir AddWalkingDetails eliminaría su tabla y métricas: requiere
antes un plan de conservación.

## Interfaz

- Registro manual: Caminata muestra distancia, ritmo y FC; Más métricas incluye
  pasos y todas las restantes. No ofrece laps ni potencia. Al cambiar de Running
  a Walking se reinician los campos específicos para no mezclar datos.
- Import: valida estructura, exige walking y presenta distancia, duración,
  ritmo, FC media/máxima y Training Effect. La API valida las reglas numéricas.
- Detalle: muestra todas las métricas disponibles y explica cuando un registro
  antiguo carece de detalles; notas y payload se conservan.
- Listado y últimas cinco actividades: distancia, duración, ritmo y FC de cada
  fila. La tarjeta global también puede mostrar distancia/ritmo de una caminata.
- Tarjetas/series agregadas de distancia, ritmo y FC siguen siendo solo Running.
  Walking suma sesiones.
- rawPayload y rawPayloadJson mantienen el texto original y la precisión de
  números grandes/decimales, sin normalizar ni borrar contenido interno.

## Verificación final

Todos terminaron con código 0:

- dotnet build backend (sin errores ni advertencias).
- dotnet ef migrations has-pending-model-changes --project backend (sin cambios).
- npm --prefix frontend run build.
- npm --prefix frontend run lint.
- node tests/api-smoke.mjs.
- node tests/dashboard-ui.mjs con Playwright externo ya instalado, sin paquetes
  nuevos del proyecto; incluye walking-ui.mjs y las pruebas Other/períodos previas.

walking-checks.mjs cubre mínimo/completo/nulls/ceros, el ejemplo del usuario,
validación de FC/duraciones/calorías/elevación/cadencia/pasos, tipo incorrecto,
precisión, detalle/listado, cascada SQL y aislamiento de Running con/sin rango.
ReviewChecks comprueba compatibilidad de las dos migraciones con registros antiguos.
La prueba UI verifica pegar → preview → confirmar → detalle/listado, ausencia
de escritura antes de confirmar, creación manual con pasos, ausencia de
laps/potencia y eliminación confirmada. Solo usa bases locales desechables.

Capturas:
[preview móvil](../artifacts/dashboard-iteration/walking-import-mobile.png) y
[detalle móvil](../artifacts/dashboard-iteration/walking-detail-mobile.png).
