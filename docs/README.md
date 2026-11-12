# Documentación de Trazo

Revisión documental: 12-11-2026. Los valores de infraestructura y las mediciones registrados corresponden a la verificación del 08-11-2026; esta actualización de documentación no despliega ni modifica recursos.

## Guías vigentes

| Documento | Uso |
| --- | --- |
| [README principal](../README.md) | Inicio local con SQL Server, funcionalidades, API, importación y pruebas por provider |
| [Producción y operaciones](near-zero-deployment.md) | Cosmos Free Tier, GHCR, ACA con una réplica encendida, costos estimados, límites y rollback |
| [Frontend](../frontend/README.md) | Desarrollo React, proxy, compilación y autenticación |
| [Progreso de fuerza](strength-progress.md) | Contratos, agrupación y PRs; implementaciones SQL y Cosmos |
| [Caminatas](walking-details.md) | Reglas del bloque walking e historia del modelo SQL |
| [Importación: verificación de UI](../tests/import-ui.md) | Procedimiento de navegador en entorno de prueba |
| [Autenticación: verificación de UI](../tests/auth-ui.md) | Procedimiento de sesión, CSRF y estados de UI |
| [Roadmap multiusuario](multi-user-roadmap.md) | Propuesta futura; no es una función implementada |

El JSON de importación conserva el contrato de `POST /api/activities`. Cambiar de SQL a Cosmos no exige reformatear los JSON existentes. Las diferencias de almacenamiento, límites de metadatos y fragmentación se explican en la guía de producción.

## Código publicado y aplicación desplegada

[v0.1.0](https://github.com/crosbostol/Trazo/releases/tag/v0.1.0) conserva el checkpoint anterior a Cosmos. [v0.2.0](https://github.com/crosbostol/Trazo/releases/tag/v0.2.0) apunta al commit `9e343e0a36f2ba63f786cb16ae349495c47d640d` e incluye bundle Git, manifiesto y checksums. Estos bundles son respaldo de código, no de los datos personales.

La imagen desplegada registrada fue compilada desde `53a3c2aebb148bb912f1e1e19671905e59d75842`. El release incluye cambios posteriores de herramientas, pruebas y documentación; su imagen construida no se desplegó automáticamente. La guía de producción identifica ambos digests. Los commits de documentación posteriores al tag no cambian el release existente.

## Informes históricos

Estos documentos conservan evidencia de su etapa original; sus referencias a producción, costos o tareas pendientes deben leerse con esa fecha. No usar las guías SQL/ACR para desplegar sobre la aplicación Cosmos actual.

- [Revisión técnica inicial](technical-review.md) y [verificación de fase 3](phase3-verification.md).
- [Comparación original de persistencia](persistence-comparison.md) y [migración de PostgreSQL a SQL Server](sql-server-migration.md). SQL sigue vigente localmente.
- [Provisioning SQL/ACR](azure-deployment.md), [estado histórico](azure-deployment-status.md), [ofertas gratuitas](azure-free-offers-verification.md) y [operación de SQL Free](azure-sql-free-operational-check.md).
- [Despliegue del 27-09-2026](azure-iteration-deployment-20260927.md) e [iteración Other/dashboard](other-dashboard-iteration.md).
- [Viabilidad Cosmos del 08-11-2026](cosmos-feasibility-20261108.md), [spike aislado](../experiments/cosmos-spike/README.md) y [plan inicial de costo cercano a cero](near-zero-plan.md). El plan inicial consideró escala a cero; la decisión final fue mantener una réplica.
- `legacy/` conserva migraciones, referencias PostgreSQL y el workflow de preservación de la imagen original; queda fuera del flujo operativo actual.

Los exports de datos, claves y backups privados se mantienen fuera de Git. Para restaurar datos, consultar las condiciones y la deuda de restauración PITR en la guía vigente; un rollback a SQL después de nuevas escrituras en Cosmos requiere reconciliación.
