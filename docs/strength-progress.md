# Progreso de fuerza — iteración local

Disponible en `/progress`, desde **Progreso** en la navegación. El selector muestra ejercicios por fecha de actividad más reciente. La página ofrece cuatro PRs, un gráfico «Mejor peso por sesión» y el historial cronológico con enlaces al detalle. No requiere migración, catálogo, backfill ni cambios en los datos existentes.

En el detalle Strength, cada nombre de ejercicio enlaza a `/progress?exercise=<nombre codificado>`. Se usa el nombre original almacenado y `URLSearchParams`, por lo que también funcionan espacios, `/`, `&`, `?` y Unicode. El backend existente resuelve el parámetro con la misma regla de agrupación y la página selecciona el nombre canónico. Si no existe, muestra un mensaje y conserva el selector. Cambiar de opción reemplaza el query string de la entrada actual del historial.

## Contrato y agrupación

- `GET /api/strength/exercises`: nombres agrupados y fecha más reciente.
- `GET /api/strength/progress?exercise=Bench+Press`: nombre, sesiones/sets, `prs` y `series`. El cliente usa `URLSearchParams`, incluyendo nombres con `/`, `&`, `?` o Unicode.
- Ambos endpoints requieren la autenticación existente. Parámetro vacío o mayor de 200 caracteres: 400; ejercicio inexistente: 404.
- Identidad no persistida: `Trim()` + `StringComparer.OrdinalIgnoreCase`. No elimina acentos, espacios interiores, puntuación ni traduce nombres. Los sets conservan el nombre original almacenado. El nombre visible del grupo es el de su primera aparición, sin espacios exteriores.
- Solo se consultan actividades Strength. Se incluye todo su historial registrado, también una fecha futura si fue guardada; esta página no aplica la ventana temporal del Dashboard.
- Una sesión es una **Activity**, incluso si contiene varias entradas del mismo ejercicio. Dos actividades del mismo día siguen siendo sesiones y puntos separados.

## Semántica exacta

| PR | Cálculo |
| --- | --- |
| HeaviestWeight | Máximo peso no nulo registrado, incluido cero y sets por tiempo con peso. |
| MostRepsAtAnyWeight | Máximas repeticiones positivas de un set, con o sin peso. Un set exclusivamente por tiempo, con reps=0, no aporta un récord de repeticiones. |
| HighestSetVolume | Máximo `weightKg × reps`, solo cuando el peso es conocido y reps > 0. |
| HighestSessionVolume | Máxima suma de esos volúmenes en una Activity, consolidando todas sus entradas del ejercicio seleccionado. |

Empates: primera fecha, luego CreatedAt, ActivityId, orden del ejercicio, ExerciseId y número de set. Se devuelve el ActivityId y la fecha; los PRs de set también identifican ejercicio, set, peso, reps y lado. El PR de sesión devuelve las reps con peso conocido; no inventa un peso único para toda la sesión.

El resumen muestra número de todos los sets y suma de reps de sets con peso conocido y reps > 0. Volumen y reps con peso conocido son `null` si no hay sets elegibles, nunca cero por defecto. Peso cero registrado sí produce volumen cero. No se presupone peso corporal. Los sets por tiempo permanecen en el historial con duración y lado. Si un set tiene reps positivas y duración, sus reps sí participan en el volumen cuando tiene peso.

La serie contiene el máximo peso conocido por Activity o null; no conecta huecos. Sin ningún peso conocido se muestra un estado vacío. Un único entrenamiento produce un único punto.

Se conservan los tipos numéricos actuales (double). Un producto o suma que desborde el rango finito de double se devuelve como null, no Infinity ni cero, para mantener JSON válido; no se imponen topes deportivos nuevos.

## Implementación y pruebas

`backend/Services/StrengthProgressService.cs` realiza una consulta de metadatos de ejercicios y una consulta de sets del grupo seleccionado; no hay N+1 ni envío de rawPayload/actividades completas. La comparación en .NET evita que la collation SQL agrupe nombres más agresivamente. Los PRs se recalculan al consultar: futuras ediciones y las eliminaciones actuales no necesitan invalidar un caché persistente.

Archivos de integración: `backend/Endpoints/ApiEndpoints.cs`, `backend/Program.cs`, `frontend/src/pages/ProgressPage.tsx`, `frontend/src/App.tsx` y `frontend/src/App.css`.

`tests/strength-progress-checks.mjs` se ejecuta desde `node tests/api-smoke.mjs`. Comprueba autenticación, estados vacíos y legacy sin ejercicios, agrupación/trim/acento, múltiples entradas/sesiones, PRs y empates, nulos/cero, duración, lado, nombres codificados, aislamiento, navegación y eliminación. Usa únicamente bases SQL desechables.

`tests/strength-progress-ui.mjs` extiende `tests/dashboard-ui.mjs` con el Playwright externo existente: selección, PRs, historial, gráfico (también mismo día y punto único), detalle, sin peso, vacío, desktop 1920 y móvil 390 sin overflow de página.

```powershell
dotnet build backend
dotnet ef migrations has-pending-model-changes --project backend
npm --prefix frontend run build
npm --prefix frontend run lint
node tests/api-smoke.mjs
$env:PLAYWRIGHT_MODULE='C:/Users/cristobal.oyarzun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:PLAYWRIGHT_CHANNEL='msedge'
node tests/dashboard-ui.mjs
```

Capturas en `artifacts/dashboard-iteration/strength-progress-wide.png`, `strength-progress-mobile.png` y `strength-progress-no-weight-mobile.png`.

Resultado local verificado el 27-09-2026: build backend correcto (0 advertencias/errores), modelo sin cambios pendientes, build frontend y lint correctos, suite API completa y suite UI completa aprobadas. Las capturas desktop/móvil y sin peso se inspeccionaron visualmente. Las bases temporales y procesos de prueba se limpiaron al terminar; no se operó sobre Azure ni se modificaron datos personales.

## Deuda técnica acotada

La agrupación lee metadatos de todos los ejercicios de fuerza en el servidor, y el historial seleccionado no está paginado. Es suficiente para el diario personal actual; antes de historiales masivos o multiusuario conviene medir y añadir paginación y una estrategia de búsqueda/indexación que preserve exactamente estas reglas. No se agrega ahora un catálogo ni una clave persistida por una necesidad hipotética.
