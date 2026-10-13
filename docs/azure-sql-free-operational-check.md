> **Corrección verificada al crear (26-09-2026):** las capacidades generales anuncian mínimo 15 minutos, pero Azure rechaza esa demora con Free + AutoPause. Solo permite el default de 60 minutos. La comprobación de capacidades de este documento no verificaba esa combinación específica. Logical server creado; DB no creada. Ver [estado actualizado](azure-deployment-status.md).

# Azure SQL Free: comprobación operativa del 26-09-2026

Único cambio autorizado y realizado en Azure: registrar `Microsoft.Sql`.
Estado final: **Registered**. No se crearon logical servers ni bases SQL,
no se modificó código de Trazo y no se reanudó el deployment.

Suscripción verificada: Visual Studio Professional Subscription,
`7333ebe0-1f75-4e4d-baf1-424585dbf3fa`, Enabled y predeterminada.

## Resultado

**Central US permite la configuración solicitada según las capacidades y cuotas
devueltas por Azure para esta suscripción.** No fue necesario buscar otra región.
La creación no se ejecutó: se comprobó disponibilidad operativa, no se reservó
capacidad ni se garantizó que nunca cambie la disponibilidad del servicio.

GET de capacidades, API `2025-01-01`, para esta suscripción y Central US:

| Campo | Resultado |
|---|---|
| Región | `Central US`, `status=Available` |
| Servidor lógico | versión `12.0`, `status=Default` |
| Edición | `GeneralPurpose`, `status=Default` |
| Objetivo | `GP_S_Gen5_2`, `status=Available` |
| Modelo | `Serverless` |
| Comportamiento Free | `AutoPause`, `status=Default` |
| Alternativa de cobro | `BillOverUsage`, disponible pero NO seleccionada |
| Tamaño | `32768 Megabytes`, `status=Default` |
| Capacidad mínima | `0.5`, `status=Default` |
| Pausa por inactividad | mínimo permitido `15 Minutes` |

Cuotas, tanto CLI como REST API `2025-01-01`:

- `FreeLimitQuota`: **currentValue=0, limit=1**, descrita como bases gratuitas
  de la suscripción en todas las regiones.
- `ServerQuota`: 0 de 250 en Central US.
- `RegionalVCoreQuotaForSQLDBAndDW`: 0 de 40 en Central US.

La documentación general anuncia hasta diez bases gratuitas. Esta cuenta devuelve
actualmente **un cupo libre**; no asumir diez ni presentar una causa no comprobada
para la diferencia. Un cupo basta para la evaluación de Trazo.

El endpoint también devuelve una edición antigua llamada `Free`, de 5 DTU y
32 MB. **No es la configuración evaluada.** Se comprobó General Purpose Serverless
con `supportedFreeLimitExhaustionBehaviors`, además de la cuota `FreeLimitQuota`.

Evidencias locales completas:
- `artifacts/sql-free-centralus-20260926.json`.
- `artifacts/sql-free-centralus-usages-20260926.json`.

## Configuración exacta propuesta, no aplicada

```json
{
  "location": "centralus",
  "sku": {
    "name": "GP_S_Gen5",
    "tier": "GeneralPurpose",
    "family": "Gen5",
    "capacity": 2
  },
  "properties": {
    "useFreeLimit": true,
    "freeLimitExhaustionBehavior": "AutoPause",
    "minCapacity": 0.5,
    "autoPauseDelay": 15,
    "maxSizeBytes": 34359738368,
    "requestedBackupStorageRedundancy": "Local",
    "zoneRedundant": false
  }
}
```

Máximo 2 vCores; mínimo 0,5 mientras está activa, cero al pausarse. El objetivo
resultante es `GP_S_Gen5_2`. `AutoPause` al consumir la cuota mensual es distinto
de `autoPauseDelay=15` por inactividad; configurar ambos.

La oferta documentada incluye **100.000 vCore-segundos/mes, 32 GB de datos y
32 GB de backup**, con PITR hasta 7 días y respaldo local en el modo elegido.
No son una cuota de requests ni 100.000 segundos de uso humano; el consumo depende
del compute facturable y del tiempo activo.

Parámetros CLI equivalentes, verificados en la ayuda instalada, pero no ejecutados:
`--edition GeneralPurpose --family Gen5 --capacity 2 --compute-model Serverless
--min-capacity 0.5 --auto-pause-delay 15 --max-size 32GB --use-free-limit true
--free-limit-exhaustion-behavior AutoPause --backup-storage-redundancy Local`.

## Recursos y costos

Se necesita crear un **logical SQL server** en Central US y la DB dentro de él:
el inventario SQL actual está vacío. El servidor lógico es un contenedor de
administración/autenticación/red, no una VM ni un Managed Instance de pago aparte.
Puede reutilizarse `rg-trazo-mvp`; nombres finales se decidirían al autorizar creación.
También se requieren credenciales protegidas y reglas de firewall concretas/TLS.
No hace falta crear ACR, entorno Container Apps, VM, Key Vault, Log Analytics,
Private Endpoint ni storage account adicional para los backups incluidos.

Costo esperado de esta DB: **USD 0 dentro de la oferta**, y al agotar el límite
permanece inaccesible hasta el siguiente mes en lugar de continuar con cargos.
No seleccionar `BillOverUsage` ni cambiar de tier automáticamente. No habilitar
extras facturables como Defender for SQL/Log Analytics sin revisión separada.
Los recursos ya existentes, especialmente PostgreSQL/ACR, siguen facturando.

## Limitaciones

- Al agotar cuota no hay servicio hasta el próximo mes; los límites mensuales no
  se acumulan. Pausa por inactividad también implica un tiempo de reanudación.
- Conexiones abiertas y probes frecuentes pueden impedir que la DB duerma.
- La región elegida para las DB gratuitas queda vinculada a la oferta de la
  suscripción según sus condiciones; Central US es la propuesta.
- No convertir/restaurar directamente una DB existente a la oferta gratuita;
  una migración futura de Trazo sería un trabajo distinto.
- La oferta gratuita no tiene SLA financiero; respaldos PITR de hasta 7 días,
  sin LTR en el modo de pausa mensual seleccionado.
- Sigue vigente el alcance individual dev/test del beneficio Visual Studio.

## Estado final y fuentes

`az sql server list` = `[]`. PostgreSQL `pg-trazo-mvp-585dbf3fa` sigue Ready en
Central US con acceso público Disabled. Deployment de Trazo permanece pausado.

[API de capacidades](https://learn.microsoft.com/rest/api/sql/capabilities/list-by-location?view=rest-sql-2025-01-01),
[oferta y cuotas incluidas](https://learn.microsoft.com/azure/azure-sql/database/free-offer),
[FAQ y limitaciones](https://learn.microsoft.com/azure/azure-sql/database/free-offer-faq),
[parámetros Azure CLI](https://learn.microsoft.com/cli/azure/sql/db).
