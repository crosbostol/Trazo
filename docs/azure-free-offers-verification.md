# Verificación de ofertas gratuitas — 26-09-2026

> Documento histórico: conserva decisiones, mediciones y resultados de su etapa original. No describe la producción actual ni autoriza repetir el provisioning o deployment. Consulta el [estado vigente](near-zero-deployment.md) y el [índice de documentación](README.md).

**Actualización posterior autorizada:** Microsoft.Sql se registró y se confirmó
General Purpose Serverless con AutoPause gratuito y un cupo libre en Central US.
Ver [comprobación operativa SQL](azure-sql-free-operational-check.md).
Lo que sigue conserva el resultado previo al registro; Cosmos no se modificó.

Consultas de solo lectura. No se crearon recursos, registraron proveedores,
modificaron configuraciones ni destruyó PostgreSQL. Deployment pausado.

## Evidencia de la suscripción

- Visual Studio Professional Subscription, ID `7333ebe0-1f75-4e4d-baf1-424585dbf3fa`.
- Enabled y predeterminada; ARM devuelve quotaId `MSDN_2014-09-01`, spendingLimit `On`.
- `Microsoft.Sql`: NotRegistered. `Microsoft.DocumentDB`: NotRegistered.
- Ambos catálogos de tipos de recursos incluyen Central US.
- `az sql server list`: []; `az cosmosdb list`: []; inventario ARM sin DB SQL ni
  cuentas Cosmos. No se detectó un beneficio gratuito ocupado por recursos existentes.
- `az sql db list-editions -l centralus` y `az sql list-usages -l centralus`:
  SubscriptionNotFound devuelto por Microsoft.Sql, aunque ARM ve la suscripción activa.
- `az cosmosdb locations show --location centralus`: Internal Server Error,
  `subscriptionQuotaId is null or empty or whitespace`.

Estos errores no prueban inelegibilidad. Con proveedores sin registrar, las APIs
específicas no completaron la comprobación. No registrar proveedores respeta el
pedido de no modificar la suscripción. Catálogo regional no equivale a garantizar
capacidad/cuota para esta suscripción en el momento de un futuro deployment.

**Conclusión verificable:** elegibilidad por reglas publicadas, cupos aparentemente
sin usar y Central US en el catálogo de los servicios; habilitación/capacidad
efectiva específica de la suscripción todavía no confirmada. No prometer creación.

## B — Azure SQL Database Free Offer / Basic

La documentación permite la oferta actual sin exigir una Azure Free subscription;
la excepción publicada es Students Starter. Visual Studio Professional no está
excluida. Por tipo de suscripción, corresponde elegibilidad documental.

Cada DB: 100.000 vCore-segundos, 32 GB de datos y 32 GB de backup al mes; hasta
10 DB por suscripción. No es una prueba de 12 meses. La región elegida para las
DB gratuitas de la suscripción queda compartida/fijada según las condiciones de
la oferta; no se encontraron servidores SQL existentes, pero la API específica
no permitió verificar un eventual estado histórico de la oferta.

Al alcanzar los límites: pausar hasta el siguiente mes o continuar pagando GP
Serverless. No asumir que pasar a cargos adicionales permite volver después a la
pausa gratuita. Basic es otro tier, no una conversión automática al agotar créditos.

Para Trazo personal: DB USD 0 si se mantiene dentro de las cuotas; hay que medir
tiempo activo, no solo cantidad de requests. Probes y conexiones pueden impedir
auto-pause. Basic cuesta ~USD 4,90/mes, 5 DTU y 2 GB incluidos; siempre facturable.
Migrar a SQL requiere adaptar Npgsql, JSONB, constraints y migraciones: 24–48 h
estimadas, reutilizando EF Core y casi todo el contrato de la aplicación.

Fuentes: [oferta](https://learn.microsoft.com/azure/azure-sql/database/free-offer),
[FAQ y comportamiento al superar límites](https://learn.microsoft.com/azure/azure-sql/database/free-offer-faq).

## C — Cosmos DB Free Tier / Serverless

Free Tier: una cuenta por suscripción, descuento activado durante la creación;
1.000 RU/s de throughput aprovisionado y 25 GB por cuenta. El inventario actual
está vacío: no se detectó otra cuenta consumiendo el cupo.
No se encontró una exclusión publicada para Visual Studio Professional.

Elegibilidad documental y cupo aparentemente libre; Central US en catálogo.
No se pudo verificar acceso/capacidad regional efectiva con la API de locations.

El exceso de almacenamiento o throughput **aprovisionado** se factura. Con RU/s
manuales fijas, más demanda puede producir 429, no un cobro automático por cada
request adicional; aumentar capacidad/autoscale puede generar cargos. El descuento
es de la cuenta, no 1.000 RU/s gratis por contenedor.

Para Trazo usar una región y throughput manual total dentro del descuento:
aproximadamente USD 0 de DB si el uso cabe en 25 GB/capacidad. Backup/restore u
opciones extra deben revisarse aparte. No se presupone autoscale ni segunda región.

**Serverless no admite Free Tier.** Factura desde el primer RU/almacenamiento:
Central US 0,282 USD/millón RU y 0,25 USD/GB-mes. Con el escenario previo de
20.000–200.000 RU/mes y 50 MB de datos+índices, ~USD 0,02–0,07/mes para una persona.
Es una estimación; no se desplegó Cosmos para medir RequestCharge.

Ambas modalidades implican la misma migración documental de Trazo: 40–72 h,
más 16–32 h si se requiere soporte de payloads grandes con Blob/reconciliación.
Conservar precisión rawPayload y mover DataProtectionKeys son trabajos necesarios.

Fuente: [Free Tier y modalidades](https://learn.microsoft.com/azure/cosmos-db/free-tier).

## Créditos Visual Studio y comparación final

Las cuotas gratuitas y los créditos pueden coexistir: la parte gratuita no genera
consumo monetario; los cargos Azure elegibles restantes pueden usar los créditos.
No son créditos adicionales ni se suman como dinero. No se verificó el saldo ni
la fecha de renovación de esta cuenta mediante una API de facturación.

Corrección respecto de una posible interpretación anterior: Visual Studio
Professional **Standard** ofrece USD 50 **mensuales renovables**, mientras siga
vigente el beneficio; no necesariamente una bolsa única de USD 50. El límite de
gasto está activo. Microsoft limita este beneficio a uso individual dev/test,
no producción permanente. Los descuentos gratuitos no eliminan esa condición
de la suscripción ni habilitan convertirla en producción con usuarios reales.
Evaluar ese uso antes de reanudar un deployment destinado a servicio permanente.
No se cambió la suscripción, su límite de gasto ni el deployment.

[Créditos elegibles y renovación](https://learn.microsoft.com/visualstudio/subscriptions/vs-azure-eligibility),
[condiciones de Visual Studio](https://azure.microsoft.com/pricing/member-offers/credit-for-visual-studio-subscribers/).

| Opción | DB mensual para Trazo personal | Estado real | Cambio de código |
|---|---:|---|---|
| A PostgreSQL B1ms | ~18,18 USD | Ya creado, Ready, Central US, 32 GB, acceso público Disabled | Ninguno de proveedor |
| B SQL Free / Basic | 0 si cumple cuota / ~4,90 USD | Elegibilidad documental; capacidad específica sin confirmar | 24–48 h |
| C Cosmos Free / Serverless | 0 dentro del descuento / ~0,02–0,07 USD | Cupo sin uso detectado; capacidad específica sin confirmar | 40–72 h + payloads grandes |

Precios comprobados el 26-09-2026 con Azure Retail Prices API: PostgreSQL B1ms
0,01921 USD/h y storage 0,13/GB-mes; SQL Basic 0,161/día; Cosmos serverless
0,282/millón RU y almacenamiento 0,25/GB-mes. Son retail antes de créditos; no
una factura contractual ni un saldo. Mantener ACR suma ~5,07/mes y hosting aparte.
Mantener PostgreSQL mientras se pruebe otra opción conserva su cargo completo.

Recomendación: A para evitar migración y usar el código ya probado; B sería el
primer candidato a evaluar si se prioriza reducir gasto conservando relaciones;
C es viable, pero ahorrar otros centavos frente a una SQL gratuita no justifica
por sí solo una migración mayor. No decidir B/C como si ya estuvieran habilitados
en Central US. La siguiente comprobación operativa requeriría autorización para
registrar proveedores y volver a consultar capacidades; no se hizo en este trabajo.
