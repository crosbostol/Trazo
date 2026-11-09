# Trazo: ruta elegida hacia costo cercano a cero

> Implementado en producción el 08-11-2026. Este documento conserva el plan original; el estado efectivo está en [near-zero-deployment.md](near-zero-deployment.md).

Actualizado el 08-11-2026. Objetivo: reducir cargos fijos y evitar la reanudación
de SQL Serverless. La configuración de producción sigue intacta; este documento
y la plantilla son preparación, no una migración completada.

## Arquitectura candidata

| Componente | Configuración | Costo esperado y condición |
| --- | --- | --- |
| Datos y claves de sesión | Cosmos NoSQL Free Tier, una región Central US, un contenedor a 400 RU/s manuales | USD 0 dentro de 1.000 RU/s y 25 GB de cuenta |
| Imagen de contenedor | GitHub Container Registry (GHCR) | Almacenamiento y transferencia actualmente sin cargo |
| API y React | Container Apps Consumption, 0,25 CPU/0,5 GiB, mínimo 0 y máximo 1 réplica | USD 0 mientras alcance la cuota gratuita compartida de la suscripción |
| Backups de Cosmos | Continuous7Days explícito | Almacenamiento de backup sin cargo; restaurar puede cobrar |

No se agrega una VM, Azure Function de encendido, hosting estático separado,
Private Endpoint ni un plan always-on. Se reutiliza la Container App existente
cuando el candidato esté probado. El HTML seguirá dependiendo del arranque de ACA;
la mejora que buscamos es eliminar la espera de SQL, no prometer apertura instantánea.

Cosmos Free Tier usa capacidad provisionada y no es la modalidad Serverless del
experimento anterior. La suscripción no tenía cuentas Cosmos al revisar el
inventario. Esto permite intentar la oferta, pero su aplicación efectiva se debe
comprobar al crear la cuenta, sin aceptar un reemplazo pagado si Azure la rechaza.

Fuentes: [Cosmos Free Tier](https://learn.microsoft.com/azure/cosmos-db/free-tier),
[GHCR](https://docs.github.com/en/billing/concepts/product-billing/github-packages),
[Container Apps Consumption](https://learn.microsoft.com/azure/container-apps/billing),
[backup continuo](https://learn.microsoft.com/azure/cosmos-db/continuous-backup-restore-introduction).

## Configuración concreta preparada

[infrastructure/near-zero/cosmos-free.json](../infrastructure/near-zero/cosmos-free.json)
define únicamente la nueva cuenta, base `trazo` y contenedor `records`. No actualiza
ACA, ACR ni SQL:

- `enableFreeTier=true`, sin parámetro para desactivar la oferta y sin fallback.
- Región única Central US; sin multi-write ni redundancia zonal.
- `capacity.totalThroughputLimit=1000`; contenedor a `throughput=400`, sin autoscale.
- Partición `/ownerId`; tipos de documentos separados por `documentType`.
- `rawPayloadJson` y XML de DataProtection excluidos del índice; índice de fecha,
  createdAt e ID equivalente al usado en el experimento.
- `Continuous7Days` explícito: evita depender del default de 30 días facturable.
- Autenticación por identidad (`disableLocalAuth=true`). Las asignaciones RBAC
  acotadas y la configuración del SDK .NET faltan; esta plantilla sola no habilita
  el acceso de la aplicación.
- Firewall obligatorio con lista no vacía; sin bypass general para Azure. Los
  parámetros de validación usan una IP de documentación, no una red operativa.

Azure Resource Manager devolvió `Succeeded`, sin error, al validar esta plantilla
contra la suscripción y el grupo de Trazo. No se ejecutó `deployment create`.
El inventario Cosmos posterior continuó vacío. Validar no reserva un cupo, no
confirma por sí solo la oferta efectiva y no sustituye pruebas de creación/lectura.

Para repetir la validación sin crear recursos:

```powershell
# Archivo de parámetros con accountName nuevo y allowedIpRules no vacíos.
az deployment group validate --subscription <subscription-id> -g rg-trazo-mvp `
  --template-file infrastructure/near-zero/cosmos-free.json `
  --parameters '@<archivo-local-de-parametros.json>'
```

El límite de throughput bloquea aumentos de capacidad que lo excedan, pero **no es
un techo de factura total ni limita almacenamiento**. La política de aplicación
deberá vigilar datos más índices y detener escrituras antes de superar la cuota
gratuita; los 20 GB por partición lógica también deben respetarse. Los budgets de
Azure avisan, no detienen automáticamente los cargos. La documentación además
contempla crecimiento automático de capacidad por almacenamiento muy grande.
[Límite de cuenta](https://learn.microsoft.com/azure/cosmos-db/limit-total-account-throughput).

## Cuota de Container Apps y costos actuales

Los 180.000 vCPU-segundos, 360.000 GiB-segundos y dos millones de requests gratuitos
mensuales se comparten por suscripción. Con 0,25 CPU y 0,5 GiB equivalen, si Trazo
fuera el único consumidor y todo el tiempo fuera activo, a 200 horas al mes.
También hay otras Container Apps en esta suscripción. No se puede prometer que
Trazo tendrá toda esa cuota ni deducir el consumo gratuito de una factura sin cargos.

Se consultó Cost Management del grupo de Trazo para el mes en curso: ACR aparece
como el cargo reportado y SQL figura en cero. Los importes de la cuenta se
conservaron fuera de Git, en `artifacts/near-zero/`, porque el repositorio es público.
La información tiene retraso de facturación. El medidor público de ACR Basic
consultado en la evaluación previa equivale aproximadamente a USD 5,07/mes.

Mantener `minReplicas=0`, evitar pings para impedir que duerma y no agregar un plan
Dedicated conserva el diseño por consumo. `maxReplicas=1` reduce la concurrencia
facturable, pero no constituye un tope mensual: una réplica ocupada todo el mes
puede superar la asignación gratuita. Se debe observar el uso compartido real.

## Orden de implementación

1. Preparar build/publicación en GHCR y comprobar que ACA puede descargar la imagen.
   Conservar una copia verificable de la imagen actual antes de retirar ACR. Cambiar
   el registro y validar el mismo código SQL es una etapa independiente de migrar
   los datos; el costo fijo no desaparece hasta retirar efectivamente ACR.
2. Crear el candidato Cosmos solo con la oferta efectiva y los límites esperados.
   Implementar el adaptador .NET, conservar validaciones, contratos y comparación
   Unicode de fuerza, y mover el key ring de DataProtection sin invalidar cookies.
3. Medir tamaños de payload antes de elegir la solución para documentos mayores
   de 2 MB. No truncar ni rechazar silenciosamente datos que SQL admite. Si hacen
   falta blobs externos, su almacenamiento/operaciones serán un costo variable
   adicional que se debe estimar; no están incluidos en el USD 0 de la tabla.
4. Copiar datos a un destino aislado conservando IDs, fechas, texto JSON y relaciones;
   comparar conteos y hashes, probar restauración y ejecutar regresiones completas.
5. Medir el arranque real del backend en ACA después de inactividad, con login,
   dashboard y fuerza. Las lecturas directas de Cosmos no miden esta ruta completa.
6. Cambiar producción cuando el candidato sea verificable. Conservar temporalmente
   SQL y el checkpoint v0.1.0 para rollback; retirar recursos antiguos solo después
   de verificar el resultado. No hay un destroy automático ligado al despliegue.

El [release v0.1.0](https://github.com/crosbostol/Trazo/releases/tag/v0.1.0)
continúa disponible con bundle Git y referencia de configuración. El
[informe de viabilidad](cosmos-feasibility-20261108.md) conserva las mediciones de
1.200 actividades sintéticas y las limitaciones del prototipo anterior.
