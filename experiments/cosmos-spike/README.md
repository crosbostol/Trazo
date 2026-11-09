# Prueba aislada de Cosmos DB

Esta carpeta no se referencia desde el backend, el frontend ni Docker. No cambia
el provider de producción. Solo usa datos generados en `model.mjs`.

Checkpoint previo: [release v0.1.0](https://github.com/crosbostol/Trazo/releases/tag/v0.1.0),
commit `c0b1749078463cb5bd9241f0e5848292ab1002c5`. Incluye un bundle Git
descargable y verificado; no es un respaldo de la base de datos.

## Ejecutar

Requisitos: Node 24 y Azure CLI autenticado. No necesita npm, .NET ni dependencias
nuevas en la aplicación. El transporte REST es exclusivo de este experimento;
para producción debe utilizarse el SDK .NET con identidad y permisos acotados.

El wrapper siguiente crea un grupo/cuenta nuevos, ejecuta las pruebas, espera la
ventana de inactividad y elimina el grupo temporal en `finally`, verificando nombre
y etiquetas. No usar Data Explorer mientras espera:

```powershell
./experiments/cosmos-spike/Invoke-Spike.ps1 -SubscriptionId '<subscription-id>'
```

El wrapper requiere Windows PowerShell para el auxiliar de Azure CLI del runner.

Las cinco pruebas locales del transporte se ejecutan sin Azure:

```powershell
node --test experiments/cosmos-spike/cosmos-rest.test.mjs
```

Los pasos manuales equivalentes al wrapper son:

1. Crear una **cuenta temporal** NoSQL Serverless, una sola región Central US,
   sin throughput provisionado, con backup periódico/local y firewall restringido
   a la IP de la estación de pruebas. El nombre debe comenzar con `trazospike` y
   el resource group con `rg-trazo-cosmos-spike-`. No reutilizar producción.
2. Configurar las tres variables siguientes con identificadores sin secretos:

```powershell
$env:COSMOS_SPIKE_SUBSCRIPTION='<subscription-id>'
$env:COSMOS_SPIKE_GROUP='rg-trazo-cosmos-spike-<sufijo>'
$env:COSMOS_SPIKE_ACCOUNT='trazospike<sufijo>'
node experiments/cosmos-spike/run.mjs seed
```

El runner verifica Serverless y región única, obtiene la clave de esa cuenta
desde Azure CLI **solo en memoria** y crea la base `spike-20261108`. Si ya existe,
falla en lugar de reemplazarla. No imprime claves, cabeceras, cookies ni payloads.

3. Tras completar `seed`, dejar **al menos diez minutos sin llamadas al data
   plane de Cosmos**, incluido Data Explorer. Luego, desde un proceso nuevo:

```powershell
node experiments/cosmos-spike/run.mjs probe
node experiments/cosmos-spike/prices.mjs
```

Los resultados sin secretos quedan en `artifacts/cosmos-spike/`. El script de
precios consulta Azure Retail Prices API y combina esos medidores con las RUs
observadas; no consulta ni representa la factura real de la suscripción.

4. Al terminar, eliminar **solo el resource group temporal creado para esta
   prueba**, después de comprobar su nombre y etiqueta `purpose=trazo-cosmos-spike`.
   No ejecutar scripts de destroy de producción. La cuenta no es necesaria para
   usar Trazo y no debe quedar consumiendo almacenamiento después de la prueba.

## Qué se comprueba

- 1.200 actividades históricas ficticias a lo largo de cinco años, con unos 20 KB
  de payload por actividad, más fixtures pequeños y un propietario distinto.
- Una actividad como documento, partición `/ownerId`, versión de esquema y
  `rawPayloadJson` como texto excluido del índice; índice compuesto por fecha,
  timestamp e ID.
- Escrituras, lecturas puntuales, borrado y paginación real mediante continuation.
- Dashboard: tres consultas proyectadas, agregados diarios del lado de Cosmos,
  cinco actividades recientes y última actividad. Se comparan conteos, distancia,
  ritmo ponderado y FC con fixtures de resultados conocidos y una referencia
  independiente en memoria. No es la implementación completa de series semanales
  ni del contrato de compatibilidad sin fechas.
- Fuerza: consulta de metadatos y luego sets del ejercicio; sesiones, cuatro PRs,
  empates, acentos, null/cero, lados y duración. Se conserva el patrón del backend
  actual, que lee todos los metadatos; no se presenta como una solución escalable
  para historiales ilimitados.
- Conservación textual de enteros mayores que 2^53, exponentes fuera del rango
  de double, decimales largos, claves duplicadas y NUL escapado.
- Rechazo explícito de documentos mayores que 2 MB. La migración necesitaría una
  estrategia de payloads grandes o un cambio de límites acordado.
- Latencia y RUs de cada petición y de las operaciones completas; primera lectura
  desde proceso nuevo después de diez minutos sin tráfico.

## Límites de interpretación

Esta prueba viaja desde una estación local en Chile hacia Central US usando HTTPS.
No mide el runtime .NET, autenticación, claves DataProtection, Container Apps,
DNS de la URL de Trazo, descarga de React ni render del navegador. Los 77,077 s de
la línea base SQL sí incluyen el arranque ACA/SQL hasta el HTML: son referencias
distintas, no un benchmark de arquitectura completo.

El intervalo de diez minutos no equivale a una noche de inactividad ni al período
de auto-pausa de 60 minutos de SQL. Una muestra rápida después de ese intervalo
no garantiza una latencia máxima futura.

La comparación JS de nombres cubre los fixtures, **no** garantiza equivalencia
Unicode general con `StringComparer.OrdinalIgnoreCase`. Un port real debe
conservar la comparación .NET y la validación de dominio antes de escribir.
Tampoco se han migrado checks SQL, claves foráneas, transacciones entre documentos,
restauración de backups ni DataProtection. Particionar por propietario no reemplaza
la autorización del servidor.

## Volver al código anterior

Producción conserva su revisión y SQL actuales. Para inspeccionar el checkpoint
sin descartar trabajo local:

```powershell
git fetch origin --tags
git switch --detach v0.1.0
# Volver al experimento:
git switch codex/cosmos-spike
```

Si se pierde la copia local, el bundle del release permite clonar `main` y el tag
en otro directorio. No contiene secretos ni datos personales de la base.
