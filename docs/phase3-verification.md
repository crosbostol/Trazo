# Fase 3 — verificación del Paso A

> Documento histórico: conserva decisiones, mediciones y resultados de su etapa original. No describe la producción actual ni autoriza repetir el provisioning o deployment. Consulta el [estado vigente](near-zero-deployment.md) y el [índice de documentación](README.md).

Verificación local finalizada el 25-09-2026. No se crearon recursos Azure.

| Verificación | Resultado |
|---|---|
| `dotnet build backend` | PASS, sin warnings ni errores |
| `dotnet ef migrations has-pending-model-changes --project backend` | PASS, sin cambios pendientes del modelo |
| `npm --prefix frontend run build` | PASS |
| `npm --prefix frontend run lint` | PASS |
| `node tests/api-smoke.mjs` | PASS, incluidas regresiones de dominio, JSON y autenticación |
| `dotnet list backend package --vulnerable --include-transitive` | Sin paquetes vulnerables reportados |
| `tests/azure-scripts.ps1` | PASS, validaciones locales sin provisioning |
| `docker build -t trazo:phase3 .` | PASS |
| `node tests/docker-smoke.mjs` | PASS |

La imagen final pesa 70,5 MiB y usa UID 1654 (no root). La prueba Docker
verificó rutas SPA/API, migraciones explícitas, base inicial vacía, ausencia de
seed y de migración automática en Production, acceso con rol de DB restringido,
cookies Secure/HttpOnly/SameSite Strict, CSRF, rechazo de cookies alteradas,
persistencia de sesión tras reinicio, logout y rotación de contraseña sin
reconstruir la imagen. PostgreSQL y contenedores temporales del test se eliminan
al terminar.

La prueba de interfaz de login, recarga y logout está descrita en
[auth-ui.md](../tests/auth-ui.md).

La base local legacy `progress` mantiene 36 actividades y 12 mediciones.
No se copiaron datos a Azure ni se aplicó la nueva migración sobre esa base.

Los scripts Azure se revisaron localmente y en modo plan con la suscripción
Visual Studio Professional. Su ejecución real, permisos de provisioning,
disponibilidad de nombres, conectividad y comportamiento en Azure quedan
pendientes del Paso B autorizado. Las pruebas locales no sustituyen esas
verificaciones de deployment.
