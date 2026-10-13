# Deployment Other/períodos + WalkingDetails · 27-09-2026

Suscripción activa verificada: Visual Studio Professional Subscription
(`7333ebe0-1f75-4e4d-baf1-424585dbf3fa`). Grupo `rg-trazo-mvp`. Se reutilizaron
Azure SQL, Container App, ACR, identidad y entorno existentes. No se crearon ni
eliminaron recursos, no hubo seed, cambios de dominio ni cambios de autenticación.

## Resultado

- URL: https://trazo-mvp.agreeableisland-910dddf7.centralus.azurecontainerapps.io
- Imagen: `trazomvp585dbf3fa.azurecr.io/trazo:20260927160652`
- Digest: `sha256:623d75a149d04cd192d19b5b1395a3c0f97f35380849b270365cc63f29436431`
- Revisión saludable y con 100% del tráfico: `trazo-mvp--20260927160726`.
- Environment: `cae-trazo-mvp-central`, Central US, Consumption, 0–1 réplicas.
- Las reglas SQL temporales se eliminaron al finalizar.

Migraciones aplicadas explícitamente, únicas pendientes antes del deployment:

1. `20260927053230_AddOtherActivity`
2. `20260927185410_AddWalkingDetails`

La historia final contiene tres migraciones incluyendo InitialSqlServer. Antes
y después: 6 Activities, 2 Running, 3 Strength, 1 Walking, 0 Other, 2
RunningDetails, 23 StrengthExercise, 67 StrengthSet, 0 BodyMeasurements. La
caminata histórica no recibió backfill (0 WalkingDetails). Fingerprint común de
Activities antes/después: `1025254866`. Al terminar había 0 fixtures de pruebas.

## Azure SQL

Central US, GP_S_Gen5 serverless, máximo 2/mínimo 0,5 vCore, 32 GiB, pausa de
inactividad 60 minutos, backup Local, sin redundancia zonal. Verificación final:
`useFreeLimit=true`, `freeLimitExhaustionBehavior=AutoPause`; no BillOverUsage.
Quedó Online por las comprobaciones. Azure Monitor devolvió 4.814 vCore-seconds
consumidos de 100.000 (95.186 restantes), con timestamp 18:12 UTC y retraso;
no representa necesariamente el consumo al cerrar la verificación.

## Producción verificada

- HTTPS, health live/ready, login, sesión, logout y rutas anónimas protegidas.
- Running y Strength existentes, con detalles conservados.
- Dashboard Semana, Mes calendario y Personalizado; rango inválido devuelve 400.
- Creación/lectura/listado/eliminación de Other/Football y Walking completo.
- Walking suma sesión sin modificar distancia, ritmo ni FC de Running, tanto en
  contrato nuevo por rango como en el endpoint compatible sin parámetros.
- `/import`, rawPayload con números grandes/exponentes y preview frontend.
- Limpieza en finally eliminó solo los dos fixtures creados; IDs iniciales iguales.
- CSS/tokens y gráficos en 1920×1080 y 390×844: mismos colores computados,
  sin overflow de página y sin errores de navegador.
- Logs: muestra de 300 líneas sin connection strings, hashes, credenciales ni
  marcadores/payloads privados.
- Reinicio controlado: contenedor reemplazado, readiness 200 en 10,0 segundos.
  Esto es una comprobación básica de arranque, no una nueva espera de 60 minutos
  para observar auto-pause de SQL.

Evidencia local ignorada por Git:

- `artifacts/azure-iteration-verification.json`
- `artifacts/azure-production-ui/evidence.json`
- `artifacts/azure-production-ui/wide.png`
- `artifacts/azure-production-ui/mobile.png`
- `artifacts/azure-production-ui/import-mobile.png`

El primer intento del nuevo smoke detectó un baseline de “hoy” capturado después
de crear fixtures. El bloque finally los eliminó. Se corrigió solo el test y se
repitió completo con resultado PASS; no requirió cambiar la aplicación desplegada.
