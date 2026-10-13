# Fase 3 — preparación y deployment Azure

El Paso A se verificó sin crear recursos. El usuario autorizó explícitamente el
Paso B el 25-09-2026 para Visual Studio Professional y luego el cambio a Central US, con el presupuesto
indicado abajo. Los scripts conservan el modo plan por defecto y sus confirmaciones.
No se cambia DNS ni se transfieren datos locales automáticamente.

## Arquitectura y decisión de costos

```text
Navegador
  └─ HTTPS, hostname generado por Azure
       └─ Azure Container Apps · Consumption · 0–1 réplica
            └─ un contenedor no-root · ASP.NET Core 10 · puerto 8080
                 ├─ React compilado / /login /activities /body /import
                 ├─ API /api/* con cookie + CSRF
                 ├─ /health/live y /health/ready
                 └─ TLS VerifyFull → PostgreSQL Flexible Server
                                      ├─ entrenamientos / mediciones
                                      └─ claves de protección de cookies

Docker local → ACR Basic privado → imagen descargada con identidad administrada
```

Se mantiene la arquitectura solicitada: un contenedor, mismo origen, sin CORS,
Static Web Apps, microservicios, Key Vault ni CI/CD. La identidad administrada es
solo para descargar imágenes del registry; no es login Entra/OAuth de personas.

ACR Basic agrega aproximadamente USD 5/mes. Es la opción preparada porque mantiene
la imagen privada, permite push manual con Azure CLI/Docker y no requiere una cuenta
o token de GitHub/Docker Hub. `az containerapp up --source` con Dockerfile también
crea un registry y puede añadir Log Analytics; no se usa para evitar recursos
implícitos. Un registry externo existente podría evitar ese costo, pero no se
asume que exista ni se publica el código en un registry público.

## Suscripción y recursos propuestos

Usar **Visual Studio Professional Subscription**, explícita en cada comando;
Azure CLI la confirmó activa y predeterminada, sin usar la corporativa. `config.local.ps1` quedó
preparado con el ID confirmado y está ignorado. Los ejemplos no contienen secretos.
No se cambia globalmente la suscripción activa de Azure CLI.

Consulta de capacidades realizada el 24-09-2026 en esa suscripción: East US devuelve
restricción de provisioning; East US 2 también quedó restringida durante el provisioning. El usuario autorizó **Central US**, donde se confirmó Standard_B1ms y PostgreSQL 17.
La disponibilidad se vuelve a comprobar al provisionar, sin sustituir por una SKU
más cara si falla. La región estadounidense prioriza costo; tiene más latencia
desde Chile; el usuario aceptó esa ubicación para este MVP.

| Recurso | Configuración propuesta | Estimación USD/mes |
|---|---|---:|
| Resource Group | `rg-trazo-mvp`, exclusivo, tag `trazo=mvp` | 0 |
| Container Apps environment | workload profile Consumption, sin Log Analytics | sin cuota dedicada |
| Container App | 0,25 vCPU / 0,5 GiB, min 0 / max 1, revisión única | ~0–5 con uso personal |
| PostgreSQL Flexible Server | Burstable B1ms, 1 vCore / 2 GiB, PostgreSQL 17 | 14,02 cómputo |
| Almacenamiento PostgreSQL | mínimo 32 GiB, crecimiento automático desactivado | 4,16 |
| Backups PostgreSQL | 7 días, LRS, sin geo ni HA | incluido hasta franquicia; exceso aparte |
| ACR | Basic, sin admin habilitado; build local | ~5,07 |
| Identidad administrada | solo AcrPull sobre ese registry | 0 |

**Total orientativo: USD 23–28/mes**, sin impuestos, egreso extraordinario ni
otros consumos de la suscripción. PostgreSQL representa el mayor fijo (~USD 18,18).
Las franquicias de Container Apps son compartidas por suscripción y no garantizan
factura cero. El usuario confirmó aproximadamente USD 50 de crédito antes del
Paso B; el saldo y vencimiento deben seguir vigilándose. No se contrataron reservas.

Precios minoristas consultados mediante Azure Retail Prices API en Central US:
B1MS 0,01921 USD/h × 730 h; storage 0,13 USD/GB-mes × 32;
ACR Basic 0,1666 USD/día × 30,44. El almacenamiento SSD administrado mínimo de
Flexible Server puede denominarse Premium SSD: no implica elegir compute General
Purpose/Memory Optimized, ACR Premium ni aumentar el tamaño mínimo del servicio.

Fuentes oficiales:
- [Azure Retail Prices API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices)
- [Precios PostgreSQL](https://azure.microsoft.com/pricing/details/postgresql/flexible-server/)
- [Facturación Container Apps y franquicias](https://learn.microsoft.com/azure/container-apps/billing)
- [Deployment desde código y recursos implícitos](https://learn.microsoft.com/azure/container-apps/quickstart-code-to-cloud)
- [Key storage EF Core](https://learn.microsoft.com/aspnet/core/security/data-protection/implementation/key-storage-providers?view=aspnetcore-10.0)

## Modelo de seguridad

- `IPersonalAuthenticator` encapsula el mecanismo temporal de un usuario.
  Se configura `Auth__PasswordHash`, generado con PasswordHasher de ASP.NET Core
  Identity (PBKDF2, salt aleatorio, 210.000 iteraciones). No se almacena la contraseña
  en DB, frontend, imagen ni archivos versionados. El proceso no arranca sin hash.
- Cookie cifrada/autenticada de ASP.NET Core: `__Host-trazo-session`, HttpOnly,
  Secure en Production, SameSite Strict, Path=/, sin Domain, 12 horas absolutas sin
  renovación deslizante. No se usan tokens en localStorage.
- Data Protection persiste su key ring en PostgreSQL (`DataProtectionKeys`). No
  depende del disco efímero ni de memoria para validar sesiones; distintas réplicas
  comparten las claves y el ApplicationName. No borrar esa tabla al redeploy.
  Su XML no tiene cifrado adicional de aplicación: se confía en cifrado de disco/
  backup de Azure y acceso restringido a PostgreSQL. Es material sensible: proteger
  los backups y no publicarlo. Para mayor separación de secretos se evaluará cifrar
  las claves con certificado/Key Vault en una fase posterior, no es obligatorio aquí.
- Rotar el hash e iniciar la revisión con ese valor invalida sesiones anteriores
  por `credential-version`. Logout elimina la cookie del navegador; una copia robada
  de una cookie sigue válida hasta expiración/rotación (sesión stateless estándar).
- Login: máximo 5 intentos/minuto globales por proceso, sin cola. Max replicas=1
  hace efectivo ese límite para el MVP. Reinicios reinician el contador; más réplicas
  multiplican el límite. No se presenta como mitigación distribuida de DDoS.
- Antiforgery ASP.NET en **todas** las escrituras `/api/*`, incluido login/logout.
  `GET /api/auth/session` anónimo entrega únicamente estado y token CSRF, no datos.
  El frontend envía el token en `X-CSRF-TOKEN`. CORS no se usa como control de acceso.
- API de actividades, cuerpo, dashboard, database-info y OpenAPI de desarrollo
  requieren autenticación. Responden 401/403, sin redirigir peticiones API a HTML.
  Los assets públicos son código/estilos, sin registros personales embebidos.
- Production no migra ni ejecuta seed, aun cuando se activen sus flags por error.
  React se sirve desde `wwwroot`; las rutas desconocidas de API nunca devuelven SPA.
- ACA termina HTTPS y reenvía al puerto HTTP privado del contenedor. La imagen
  habilita forwarded headers para ese proxy administrado. No publicar directamente
  el puerto 8080 en Internet ni reutilizar esa confianza detrás de un proxy que no
  sanee encabezados. El rate limiter no usa IPs aportadas por el cliente.
- Cabeceras no-store en API, nosniff, DENY para framing, no-referrer y HSTS en
  Production. No body logging, cookies, contraseñas ni rawPayload en logs.
- Conexión runtime con rol `trazo_app`: CRUD y secuencias en su base, sin propiedad
  del esquema ni permisos de migración. El administrador se usa solo desde el equipo
  de operaciones para provisionar/migrar. Ambas credenciales son distintas.

## Red de PostgreSQL

Endpoint público con TLS `SSL Mode=VerifyFull` (incluye comprobación de hostname y
certificado); **no** se abre `0.0.0.0` para todos los servicios Azure ni un rango
Internet completo. Provisioning comienza sin IPs permitidas. Migrate abre solo una
IPv4 local proporcionada y elimina esa regla temporal en `finally`.

Deployment permite las IPs de salida publicadas de Container Apps. Estas pueden
cambiar: ejecutar `status.ps1 -SyncFirewall` tras cambios del entorno. Si Azure no
publica IPs, el script se detiene; no usa acceso global como fallback. Puede haber
indisponibilidad entre un cambio de IP y su actualización. Las reglas antiguas no
se borran automáticamente; revisarlas y quitarlas deliberadamente tras verificar
el nuevo acceso. Si esta limitación deja de ser aceptable, evaluar VNet/private
networking y acceso de migración, con su costo/complejidad antes de implementarlo.

## Paso B: secuencia manual, solo tras aprobación

Prerequisitos: Azure CLI autenticada en VS Pro, permisos para crear recursos y
asignar AcrPull (Contributor solo puede no bastar), Docker Desktop, .NET 10,
Node 24, PowerShell. No instalar pipeline ni service principal de CI.

```powershell
Copy-Item scripts/azure/config.example.ps1 scripts/azure/config.local.ps1
# Editar los valores; el archivo local preparado ya identifica VS Pro.
./scripts/azure/provision.ps1                 # solo lectura: plan y capacidades

# SOLO después de aprobar Paso B:
./scripts/azure/provision.ps1 -Execute
./scripts/azure/migrate.ps1 -Execute -InitialEmptyCheck -ClientIp TU_IPV4_PUBLICA
./scripts/New-AuthSecret.ps1
./scripts/azure/build-and-deploy.ps1 -Execute
./scripts/azure/status.ps1
```

Provision pide escribir el grupo antes de crear recursos con costo. Es
conservador al reencontrar recursos: reutiliza los existentes, no los destruye
ni redimensiona automáticamente. Los nombres globales pueden estar ocupados;
ajustarlos en config antes de crear nada.

Migrate pide la contraseña administrativa, aplica `dotnet ef database update`
manualmente, comprueba migraciones pendientes y conteos. En el primer despliegue
`-InitialEmptyCheck` exige cero actividades/mediciones y prepara el rol `trazo_app`
con una contraseña diferente leída de forma segura. Las migraciones posteriores
no usan ese switch; los grants por defecto cubren tablas creadas por el migrador.
Respaldar y revisar las migraciones antes de cada cambio futuro; no automatizar Down.

Los secretos se envían a Container Apps desde un archivo JSON temporal con ACL
del usuario actual, eliminado al terminar. No se escribe connection string en el
config. No activar transcripción PowerShell ni `az --debug` en operaciones con
secretos. La creación inicial de PostgreSQL requiere pasar la contraseña al CLI;
puede existir brevemente en argumentos del proceso local: ejecutar en un equipo
confiable y no compartir capturas/listados de procesos.

Build/deploy genera un tag único, compila localmente, publica en ACR y solicita
una revisión única con probes. La primera revisión puede esperar a la regla del
firewall; repetir `status.ps1 -SyncFirewall` si sus IPs todavía no estaban listas.
Readiness debe devolver 200 antes de usarla; live 200 solo prueba proceso vivo.
Un 401 anónimo en `/api/dashboard` es lo esperado, no un fallo de despliegue.

Comprobar con el hostname Azure: login incorrecto/correcto, recarga, logout,
`/activities`, `/body`, `/import`, cero datos iniciales y primera importación real.
No se trasladan las 36 actividades/12 mediciones demo de `progress`. Antes de
registrar datos reales localmente, seguir el archivo/respaldo del README con
`Initialize-RealDatabase.ps1 -ArchiveExisting`; no se ejecuta por provisioning.

## Rotación, operación y eliminación

En el primer deployment autorizado se generaron contraseñas aleatorias diferentes
para Trazo, el administrador PostgreSQL y `trazo_app`. El respaldo local está en
`%LOCALAPPDATA%\Trazo\azure-credentials.clixml`, fuera del repositorio, con ACL
restringida al usuario y SecureString cifrado mediante DPAPI de Windows. Solo puede
descifrarse con la misma cuenta en este equipo; trasladar las credenciales a un
gestor seguro para no depender de ese respaldo local. No se imprime su contenido.

Para copiar una credencial inicial al portapapeles sin mostrarla en consola:

```powershell
./scripts/azure/Copy-InitialPassword.ps1                 # login de Trazo
./scripts/azure/Copy-InitialPassword.ps1 -Name PostgresApp
./scripts/azure/Copy-InitialPassword.ps1 -Name PostgresAdmin
# Después de pegar en el destino/gestor:
Set-Clipboard -Value ''
```

El archivo contiene credenciales iniciales: no se sincroniza tras una rotación.
Guardar la contraseña nueva en el gestor; la contraseña anterior dejará de servir.

```powershell
./scripts/azure/rotate-password.ps1             # plan
./scripts/azure/rotate-password.ps1 -Execute    # secreto nuevo + restart, sin build
./scripts/azure/status.ps1
# Solo cuando se quiera ELIMINAR deliberadamente todo Trazo:
./scripts/azure/destroy.ps1
```

Destroy muestra inventario, comprueba el tag del grupo y exige escribir
`DELETE <subscription>/<resource-group>`. Nunca se llama desde otro script.
Crear y verificar un dump externo antes de destruir; los backups administrados
no sustituyen una exportación independiente para ese caso.

Sin Log Analytics no se paga ingestión/retención de un workspace. Se dispone del
stream de consola para diagnóstico puntual (`az containerapp logs show`); no hay
histórico durable de logs de aplicación. Vigilar consumo y almacenamiento desde
Cost Management/CLI antes de agotar el crédito. Apagar la app no elimina el costo
de PostgreSQL/ACR. No se presupone que detener PostgreSQL sea una suspensión indefinida.

Para reducir costos temporalmente sin eliminar datos, detener PostgreSQL desde CLI
cuando no se vaya a utilizar Trazo (la aplicación quedará sin servicio de datos):

```powershell
$c = & ./scripts/azure/config.local.ps1
az postgres flexible-server stop --subscription $c.SubscriptionId -g $c.ResourceGroup -n $c.PostgresServerName
# Para retomar:
az postgres flexible-server start --subscription $c.SubscriptionId -g $c.ResourceGroup -n $c.PostgresServerName
```

La parada elimina el cargo de cómputo PostgreSQL mientras dure; almacenamiento,
backups facturables y ACR siguen cobrando. Azure vuelve a iniciar el servidor
automáticamente después de siete días. No es una suspensión permanente ni se
ejecutó como parte del deployment. [Referencia oficial de stop/start](https://learn.microsoft.com/azure/postgresql/configure-maintain/how-to-stop-server).
Container Apps baja a cero por inactividad; no mantener monitores HTTP periódicos
si se quiere conservar ese ahorro. Para eliminar el gasto recurrente a largo plazo,
exportar y verificar un respaldo externo antes de usar deliberadamente `destroy.ps1`.

## Pruebas locales reproducibles

```powershell
dotnet build backend
dotnet ef migrations has-pending-model-changes --project backend
npm --prefix frontend run build
npm --prefix frontend run lint
node tests/api-smoke.mjs
docker build -t trazo:phase3 .
node tests/docker-smoke.mjs
```

El smoke Docker ejecuta `docker run` sobre una base temporal aislada: comprueba
SPA/API, no-root, ausencia de migración/seed automático, migración explícita,
cookies Production y sesión tras reinicio. Simula el encabezado de terminación TLS
de ACA en loopback; no elimina Secure ni afirma probar un certificado Azure localmente.
En desarrollo normal Vite sigue en 5173 con proxy a 5143. El runtime de Production
incluye .NET 10.0.12; dependencias de Microsoft/EF y herramienta EF actualizadas a
10.0.12 por avisos de seguridad detectados al incorporar Data Protection.

## Dominio futuro (no ejecutado)

Después de validar el hostname Azure: registrar `trazo.iscom.cl` en Container Apps,
publicar CNAME al hostname generado y TXT de validación `asuid.trazo` con el token
devuelto por Azure. Para emitir/renovar certificado administrado, mantener DNS
directo (Cloudflare **DNS only**, nube gris), CAA compatible y validación alcanzable.
Mantener DNS only mientras se use el certificado administrado: Cloudflare como
intermediario puede impedir emisión y renovación. Un futuro proxy naranja requiere
revisar otra estrategia de certificado y usar Full (strict), nunca Flexible. Consultar
la [documentación de dominio/certificado administrado](https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates)
en ese momento. NIC Chile/Cloudflare no se modifican en esta fase.
