# Iteración local: otros deportes y períodos del resumen

> Documento histórico: conserva decisiones, mediciones y resultados de su etapa original. No describe la producción actual ni autoriza repetir el provisioning o deployment. Consulta el [estado vigente](near-zero-deployment.md) y el [índice de documentación](README.md).

Implementada el 27 de septiembre de 2026. No se ejecutó ningún comando Azure,
despliegue ni migración de Production. Las pruebas usan bases SQL locales
`progress_test_<timestamp>` independientes y las eliminan al finalizar.

## Cambios

- `Other` y `activitySubtype` opcional en el mismo contrato POST. Subtipo libre
  de hasta 200 caracteres, exclusivo de Other; admite Football, Padel, etc.
  No requiere running ni fuerza y rechaza detalles de otros tipos.
- Registro manual, importación, listado, detalle y última actividad muestran
  el subtipo. Se reutilizan validación, confirmaciones y conservación de
  rawPayload. Other suma sesiones sin alterar distancia, ritmo o FC de running.
- `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` agrega en SQL por fecha,
  devuelve métricas del rango y cinco resúmenes recientes. No envía el historial
  completo, laps, sets ni payloads. Sin parámetros conserva el contrato previo.
- Semana: lunes–hoy; Mes: primero del mes–hoy; Personalizado: fechas inclusivas.
  Se rechazan fechas inválidas, rango invertido, parámetro faltante y fin futuro.
  Hoy usa America/Santiago; la última actividad continúa siendo global sin futuras.
- Series diarias hasta 31 días, semanales desde 32. Semanas lunes–domingo con
  extremos recortados al filtro. Ritmo ponderado por distancia en cada intervalo;
  FC media por carrera. Sin métricas: null. Sesiones/distancia sin datos: cero.
- El gráfico principal alterna distancia running y sesiones. Así Other aparece
  en la distribución de actividad sin sumar kilómetros ficticios.

## Color y responsive

El CSS previo no cambiaba fondos por breakpoint: variaban padding, columnas y
altura de gráficos. El fondo `#101413` y panel `#19201c` tenían poca saturación;
los gráficos además usaban grises independientes (`#293031`, `#7e8989`). Las
superficies grandes acentuaban esa diferencia perceptual. No había tokens de
paleta compartidos que mantuvieran alineados esos elementos.

Los tokens en `index.css` unifican fondo, paneles, superficies elevadas, bordes,
texto secundario, acento, hover/focus y gráficos. Se conserva la estructura
existente y el acento lima. El fondo ahora es `#101a14` y las superficies
`#19291e`; los cuatro viewports muestran exactamente esos colores computados.
La tarjeta de última actividad conserva su degradado verde.

Se verifican 1920×1080, 1440×1000, 768×1024 y 390×844. Los gráficos conservan ancho
positivo y no hay overflow horizontal del documento. Las tablas mantienen su
scroll horizontal interno; nombres e iconos permanecen legibles y compactos.
La barra inferior móvil es fija: en una captura de página completa aparece en
el borde inferior del viewport original, no en el fondo de toda la página.

Evidencia generada en `artifacts/dashboard-iteration/`:

- Desktop amplio (`../artifacts/dashboard-iteration/wide.png`, artefacto local no incluido en Git)
- Desktop (`../artifacts/dashboard-iteration/desktop.png`, artefacto local no incluido en Git)
- Tablet (`../artifacts/dashboard-iteration/tablet.png`, artefacto local no incluido en Git)
- Móvil (`../artifacts/dashboard-iteration/mobile.png`, artefacto local no incluido en Git)
- Colores, anchos y resultados (`../artifacts/dashboard-iteration/responsive.json`, artefacto local no incluido en Git)

## Pruebas

Comandos de verificación:

```powershell
dotnet build backend
dotnet ef migrations has-pending-model-changes --project backend
npm --prefix frontend run build
npm --prefix frontend run lint
node tests/api-smoke.mjs
```

Resultado final: los cinco comandos terminaron con código 0. Backend: cero
errores y advertencias. EF: ningún cambio de modelo pendiente respecto de la
migración. Frontend: build y lint correctos. Smoke: todas las comprobaciones
de integración aprobadas. `dashboard-ui.mjs` también terminó con código 0;
sus capturas finales fueron revisadas visualmente.

`api-smoke` incluye `dashboard-checks.mjs` y `ReviewChecks`: semana, mes calendario
distinto de 30 días, límites inclusivos, nulls, ponderación, rango vacío, 31/32
días, semanas parciales, medianoche/DST de Santiago, Other/importación/eliminación,
precisión numérica y compatibilidad del endpoint sin fechas. También conserva
los tests previos de autenticación, seed, dominio, cascadas y Production.
La prueba de actualización migra primero al esquema SQL original, inserta una
actividad con running, aplica AddOtherActivity y verifica que ambos se conservan.

La prueba de navegador `tests/dashboard-ui.mjs` usa Playwright ya disponible
en el runtime de trabajo, sin añadir dependencias npm al proyecto. Es opcional
y separada de api-smoke. Usa Edge headless, backend en 5145 y Vite en 5180:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\ruta\a\playwright\index.mjs'
$env:PLAYWRIGHT_CHANNEL = 'msedge'
node tests/dashboard-ui.mjs
```

Verifica login existente, pegar Football → preview → confirmar → detalle →
listado/dashboard, ausencia de escritura antes de confirmar, mes calendario,
error por rango invertido, período vacío con última actividad global, creación
manual de Padel, eliminación confirmada, foco visible, cuatro viewports y ausencia
de excepciones del navegador. Cierra sus procesos y elimina solo su base temporal.

## Archivos principales

- Backend: `Models/Activity.cs`, `DTOs/CreateRequests.cs`, `Data/ProgressDbContext.cs`,
  `Services/RequestValidation.cs`, `Services/DashboardService.cs`,
  `Endpoints/ApiEndpoints.cs`, migración `20260927053230_AddOtherActivity` y snapshot.
- Frontend: `DashboardPage.tsx`, `dashboardPeriod.ts`, formularios/importación/detalle,
  `types.ts`, `format.ts`, `importActivity.ts`, `components.tsx`, `index.css`, `App.css`.
- Pruebas: `dashboard-checks.mjs`, `dashboard-ui.mjs`, `api-smoke.mjs`,
  `ReviewChecks/Program.cs`. Documentación: README y este informe.

## Deuda acotada

- La pantalla Actividades todavía usa el listado completo y filtra por tipo en
  el navegador. El dashboard nuevo ya evita hacerlo; paginar el listado conviene
  cuando el historial crezca.
- Rangos de muchos años producen muchas semanas. Se puede evaluar resolución
  mensual más adelante si el uso real lo exige; no se añadió analytics extra.
- La migración se aplicó en Azure el 27-09-2026 junto con AddWalkingDetails.
  No revertirla sin preparar los registros Other: el esquema anterior no los admite.
