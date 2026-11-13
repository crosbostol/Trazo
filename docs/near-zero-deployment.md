# Producción: Cosmos Free Tier + GHCR + API siempre encendida

Desplegado el 08-11-2026. Este documento sustituye para producción las guías
históricas de provisioning SQL/ACR. El desarrollo local sigue usando SQL Server
por defecto y la suite SQL se conserva.

URL: https://trazo-mvp.agreeableisland-910dddf7.centralus.azurecontainerapps.io

## Vigencia y versiones

Actualizado con el despliegue del 12-11-2026. Las mediciones de latencia y estimaciones de costos conservan su fecha original del 08-11-2026. Para navegar por guías actuales e informes históricos, usa el [índice](README.md).

El [release v0.2.0](https://github.com/crosbostol/Trazo/releases/tag/v0.2.0) apunta a `9e343e0a36f2ba63f786cb16ae349495c47d640d`. Su workflow [verificado](https://github.com/crosbostol/Trazo/actions/runs/42548981288) publicó la imagen `ghcr.io/crosbostol/trazo@sha256:aac214edf8a2abd0187a358b85f87927c41e069cfe0c4b69d66156cbc7611e45`. La imagen de v0.2.0 no se desplegó; la primera imagen Cosmos de producción se compiló desde `53a3c2a`. Los cambios posteriores incluyen herramientas de preservación exacta de payload, pruebas y documentación.

## Despliegue Ritmo del 12-11-2026 (actual)

Se desplegó el commit `5ec65c21a609afecef6f6f388bdd07bc6ed94467`: diseño Ritmo con paleta oscura, curvas de pista, anillos de respiración decorativos y padding responsive del botón de copia. El [pipeline](https://github.com/crosbostol/Trazo/actions/runs/43334921843) completó build, codecs Cosmos, lint y smoke SQL. La etiqueta de revisión OCI de la imagen se contrastó con el commit antes de desplegar por digest.

La revisión `trazo-mvp--0000001` quedó Healthy con una réplica y 100 % del tráfico. Se conservaron identidad, provider Cosmos, secretos, base, recursos y escala mínimo/máximo 1. HTML, readiness y sesión anónima devolvieron 200; el dashboard sin sesión devolvió 401. Se verificó que los assets públicos incluyen el diseño Ritmo y el botón, sin simulación de sesión ni datos del concepto.

Antes del despliegue se comprobó el build de producción en siete pantallas y tres tamaños (1440/390/320), sin overflow ni errores JavaScript, con copia exacta al portapapeles, movimiento reducido y login sin sesión. Datos de prueba interceptados únicamente por el navegador local; no se crearon registros en producción. Los estudios comparativos continúan como entradas locales separadas y no se incluyen en el build normal. [Diseño y comprobaciones](ink-concept.md).

Para revertir únicamente esta actualización visual manteniendo Cosmos, la imagen anterior es `ghcr.io/crosbostol/trazo@sha256:44da9772ab06f9f6b102d9129a10adecc6697b82c940ddf4494c50ef9d7cee2a`; usar el helper de actualización por digest descrito abajo. Evidencia resumida en `infrastructure/near-zero/deployed-2026-11-12.json`.

## Despliegue de copia JSON del 12-11-2026 (anterior)

Se desplegó el commit `e5e7e445bf25915a186df7e3ffbd93a5eed9f979`, que añade **Copiar JSON para importar** al detalle de actividad. El [pipeline](https://github.com/crosbostol/Trazo/actions/runs/43331652321) terminó correctamente, incluyendo build, codecs Cosmos, lint y smoke SQL con exportación/reimportación sin pérdida de precisión.

La revisión `trazo-mvp--bw49zfv` quedó Healthy, con una réplica y 100 % del tráfico. Se actualizó solo la imagen mediante el helper por digest; se conservaron Cosmos, identidad, secretos, recursos y escala mínimo/máximo 1. Verificación pública: HTML y readiness 200, sesión anónima 200, dashboard anónimo 401 y bundle JavaScript con el botón nuevo. El portapapeles se comprobó antes del despliegue en navegador local con datos simulados, tamaños 1280/390 y permiso denegado; no se importaron duplicados en producción.

Imagen anterior conservada para revertir esta actualización manteniendo Cosmos: `ghcr.io/crosbostol/trazo@sha256:047eff8311e957c1664db0124790bc6173cec2b449417fdefc531af7308b704a`.

## Configuración

- ACA `trazo-mvp`, Central US, Consumption, 0,25 CPU/0,5 GiB, mínimo 1 y máximo 1 réplica.
- Revisión actual `trazo-mvp--0000001`. Readiness cada 2 segundos,
  inicio inmediato y una confirmación; liveness conserva su configuración previa.
- Provider `Database__Provider=Cosmos`; modo de solo lectura desactivado después
  de la migración. Inicialización y seed siguen desactivados en Production.
- Cuenta `trazo-free-585dbf3fa`: `enableFreeTier=true`, una región, capacidad de
  cuenta limitada a 1.000 RU/s; base `trazo`, contenedor `records` a 400 RU/s manuales.
- Firewall por IPs de salida publicadas de ACA; sin bypass general para Azure ni
  Private Endpoint de pago. Autenticación local de claves desactivada.
- Identidad administrada existente `id-trazo-pull`, con permiso de datos acotado
  a `/dbs/trazo/colls/records`. No se añade un secreto Cosmos a la aplicación.
- Backup `Continuous7Days`; almacenar el backup no tiene cargo, restaurar sí puede
  tenerlo. La restauración PITR de Azure no se invocó en esta migración.
- Imagen pública e inmutable:
  `ghcr.io/crosbostol/trazo@sha256:7380021cc19e354409ed86bfdfee7d4dbca83907a1aed9ae53339f6d408e18c2`.
  Código de aplicación compilado del commit `5ec65c21a609afecef6f6f388bdd07bc6ed94467`.
- La imagen **original**, copiada sin recompilar y con el mismo digest anterior:
  `ghcr.io/crosbostol/trazo@sha256:fe03fbef4faa414655af0f81a2731115fcf17224684282d03eef8c9be5caaab4`.
  El tag de consulta es `original-20260927212107`.

El registro dedicado `trazomvp585dbf3fa` de ACR se retiró después de verificar
la copia original en GHCR y las lecturas autenticadas en producción. No se tocaron
otros registros ni aplicaciones de la suscripción.

El usuario eligió mantener una réplica encendida el 08-11-2026 para evitar el
arranque habitual al entrar. Se modificó únicamente la escala, conservando imagen,
datos, autenticación y recursos. La réplica se verificó en estado Running; el HTML
respondió en 0,537 s (segunda petición 0,422 s), sesión anónima en 0,150 s y readiness
en 0,139 s. El dashboard anónimo mantuvo 401. Estas mediciones no incluyen el render
del navegador ni garantizan disponibilidad ante reinicios de plataforma.

Estimación del 08-11-2026 de cómputo para 730 horas/mes en reposo con esta asignación: unos USD
4,29 si las cuotas gratuitas están disponibles, o USD 5,91 sin ellas. El tiempo
activo se cobra a su tarifa correspondiente y puede elevar ese costo. Es una
estimación, no un límite de factura. La memoria y vCPU idle consultadas en Central
US cuestan USD 0,000003 por GiB-segundo y vCPU-segundo, respectivamente. Las cuotas
se comparten con otras aplicaciones. [Facturación](https://learn.microsoft.com/azure/container-apps/billing),
[precios](https://azure.microsoft.com/pricing/details/container-apps/).

## Conservación de datos y sesiones

El guardado se pausó brevemente mediante `Database__ReadOnly=true` en una revisión
SQL, manteniendo las lecturas y autenticación. Se exportaron actividades completas,
mediciones y XML del key ring; se importaron al destino y se compararon IDs y hashes
de contenido normalizado. El texto del payload JSON se conservó exactamente.
Los timestamps de auditoría mantienen su instante UTC y se guardan con formato
ISO UTC uniforme; las fechas de entrenamiento siguen siendo DateOnly.

La revisión final detectó que deserializar solo el JSON anidado del snapshot
normalizaba sus espacios/escapes. Se corrigió el lector para usar el campo de texto
`rawPayloadJson` guardado por el export; se restauró ese texto en los documentos
afectados mediante comparación de metadatos y ETag, sin alterar métricas/fechas.
Después se repitió la verificación completa contra el snapshot original y pasó.
La suite incluye una regresión específica de exportación/restauración del texto.

La importación no hace upsert destructivo: si un ID existe con contenido diferente,
se detiene. Se verificó también que no hubiera actividades/mediciones adicionales
en el destino antes del cambio de tráfico. No se imprimieron datos ni contraseñas.

Se conservaron las claves originales y el hash de contraseña personal. Una prueba
administrativa efímera protegió un ticket con el key ring del snapshot SQL y comprobó
que la aplicación Cosmos lo aceptaba para lecturas autenticadas. No se agregó un
bypass al producto, no se cambió la contraseña y no se guardó el ticket en Git.
La cookie real del navegador del usuario no se inspeccionó.

El snapshot final cifrado con DPAPI está fuera del workspace, en
`%LOCALAPPDATA%/Trazo/backups/trazo-before-cosmos-20261108-final.dpapi`.
Su descifrado requiere el mismo usuario de Windows; no es un backup portátil.
SQL se conserva intacto, con su oferta gratuita y política AutoPause, como origen
de rollback. Los archivos privados de trabajo están ignorados por Git y restringidos
por ACL; ningún export de datos reales se publicó en el repositorio o release.

## Verificaciones

- Build backend sin errores ni advertencias; auditoría NuGet del backend sin
  vulnerabilidades conocidas en las fuentes consultadas.
- Suite completa SQL, migraciones/constraints/seed/reloj/Production, y build/lint
  frontend ejecutados en GitHub Actions con SQL Server 2022 aislado.
- Suite HTTP Cosmos con base separada: auth/CSRF/rate limit, importación, ambos
  contratos del dashboard, Walking, fuerza/PRs/Unicode, cuerpo, payload de alta
  entropía mayor de 2 MB y cookie conservada tras reiniciar el proceso.
- Pruebas locales del codec: precisión, integridad, fragmentos faltantes/corruptos,
  identidad de fragmentos y descompresión acotada.
- Candidato aislado en ACA con identidad administrada: login, dashboard, fuerza
  y barrera de solo lectura. Después se eliminó la aplicación candidata, la base
  de pruebas y las asignaciones de datos temporales.
- Producción: HTML/readiness/sesión anónima 200, dashboard anónimo 401; lecturas
  autenticadas de sesión, base, dashboard, actividades y fuerza 200. El conteo
  de actividades coincidió con el snapshot final.

Se observaron cero réplicas mediante Management y luego se midió el primer HTTPS,
sin forzar reinicios ni pausar bases, **antes de elegir mínimo 1**:

| Configuración | Primer HTML | Sesión anónima adicional |
| --- | ---: | ---: |
| SQL Free + probes anteriores | 77,077 s | 0,162 s después del segundo HTML caliente |
| Cosmos Free, readiness anterior | 41,757 s | 0,476 s |
| Cosmos Free, readiness cada 2 s | 36,272 s | 0,461 s |

Son muestras individuales: la diferencia entre los dos últimos ensayos no permite
atribuir toda la mejora al probe porque el scheduling de ACA también varía. Los
logs del primer ensayo Cosmos muestran imagen descargada en unos 4,7 s, una espera
de plataforma antes de crear el contenedor y unos 2 s entre inicio del contenedor
y ASP.NET escuchando. El intervalo completo sigue incluyendo escala, descarga,
arranque, disponibilidad y red. Una medición caliente dio HTML en 0,56 s y dashboard
autenticado en 0,90 s. No son garantías de latencia máxima ni mediciones de render UI.

El test reproducible `tests/azure-cold-start.mjs` usa `TRAZO_SUBSCRIPTION`,
`TRAZO_GROUP`, `TRAZO_APP` y `TRAZO_URL`; observa la revisión más reciente en modo
Single y no modifica escala ni fuerza reinicios. Solo hace GET anónimos después
de comprobar cero réplicas. La configuración actual de mínimo 1 es incompatible
con ese test por diseño: no debe volver a ponerse mínimo 0 solo para ejecutarlo.

## Modelo físico y límites

Una actividad es un documento plano con `documentType=activity`, partición
`ownerId=personal`; el XML de claves está en la partición `system:dataprotection`.
Las mediciones conservan su ID público y usan un prefijo físico para evitar
colisiones de GUID entre tablas originales.

El payload se guarda como texto, excluido del índice. Si no cabe en el documento,
se comprime y divide en fragmentos inmutables por actividad, también excluidos del
índice. El root se publica al final y la lectura comprueba longitudes y SHA-256
antes de reconstruir el JSON. El DELETE elimina el root y sus fragmentos propios;
no rompe otra actividad con contenido igual. Un fallo entre escrituras puede dejar
fragmentos sin root: su recolección segura sigue siendo deuda operativa y su espacio
cuenta contra la cuota. No se truncan payloads para hacerlos caber.

Los metadatos **sin rawPayload** tienen un límite conservador de 1,75 MB. Un request
que lo exceda devuelve 413; es una diferencia respecto a SQL para actividades con
arrays enormes de ejercicios/sets. Se validó que los registros migrados cabían.

El límite de RU/s no es un techo de factura total. Los 25 GB gratuitos incluyen
índices y el límite por partición lógica es 20 GB. ACA comparte sus cuotas gratuitas
con otras aplicaciones de la suscripción. Por ello el objetivo es costo cercano a
cero bajo estas condiciones, sin prometer cero para cualquier uso. El consumo
histórico ya facturado de ACR no desaparece de la factura al eliminar el recurso.

## Actualizaciones y rollback

El workflow `.github/workflows/container.yml` compila, ejecuta regresiones de codecs Cosmos y el smoke SQL, y
publica una imagen GHCR cuando un push a main afecta sus rutas configuradas (backend, frontend, tests, Dockerfile o workflow), o por ejecución manual. La integración cloud Cosmos se ejecuta por separado, no en CI. No despliega automáticamente ni cambia secretos.
Para revisar o aplicar una imagen por digest conservando la configuración Cosmos:

```powershell
./scripts/azure/update-cosmos-image.ps1 -SubscriptionId <id> -ImageDigest sha256:<digest>
# Tras revisar el plan:
./scripts/azure/update-cosmos-image.ps1 -SubscriptionId <id> -ImageDigest sha256:<digest> -Execute
```

El script SQL/ACR antiguo ahora rechaza operar sobre una aplicación configurada
con Cosmos. Para rollback inmediato **sin escrituras posteriores al corte**, se
puede desplegar la imagen original de GHCR y volver a SQL con la conexión conservada:

```powershell
az containerapp update -g rg-trazo-mvp -n trazo-mvp --subscription <id> `
  --image ghcr.io/crosbostol/trazo@sha256:fe03fbef4faa414655af0f81a2731115fcf17224684282d03eef8c9be5caaab4 `
  --set-env-vars Database__Provider=SqlServer Database__ReadOnly=false
```

Si ya hubo registros o eliminaciones en Cosmos, primero hay que exportarlos y
reconciliar el estado: SQL conserva el snapshot del corte, no las escrituras nuevas.
No hay un destroy automático ni se debe reactivar una revisión que aún referencie
el ACR eliminado. El checkpoint de código sigue en el [release v0.1.0](https://github.com/crosbostol/Trazo/releases/tag/v0.1.0).
