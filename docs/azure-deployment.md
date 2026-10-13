> Actualización: el usuario autorizó autoPauseDelay=60. Provisioning reanudado con Free + AutoPause; los rechazos de 15 minutos se conservan abajo como registro histórico.

# Deployment manual de Trazo con Azure SQL Free

Estado real y pendientes: [azure-deployment-status.md](azure-deployment-status.md). Diferencias del provider y pruebas: [sql-server-migration.md](sql-server-migration.md). El procedimiento PostgreSQL anterior queda archivado en `docs/legacy/azure-deployment-postgresql.md`; no ejecutarlo con el código nuevo.

## Recursos y configuración

Suscripción Visual Studio Professional, grupo `rg-trazo-mvp`. Reutilizar ACR Basic `trazomvp585dbf3fa` e identidad `id-trazo-pull` de East US 2. Reutilizar `cae-trazo-mvp-central` en Central US para `trazo-mvp`, Consumption 0.25 CPU/0.5 GiB, 0–1 réplicas. El entorno antiguo `cae-trazo-mvp` de East US 2 queda intacto y vacío; no tiene cargo fijo de plan esperado bajo Consumption sin workspace/endpoints privados.

Azure SQL: logical server `sql-trazo-mvp-585dbf3fa`, DB `trazo`, Central US, GP_S_Gen5_2, mínimo 0.5/máximo 2 vCores, 32 GB, backup Local con retención 7 días, sin redundancia zonal ni Defender de pago. Siempre `useFreeLimit=true` y `freeLimitExhaustionBehavior=AutoPause`; nunca BillOverUsage ni sustitución automática por otra SKU.

**Configuración resuelta:** Azure rechazó 15 minutos con Free/AutoPause; el usuario autorizó el default de 60 minutos. La DB fue creada y los flags Free se comprobaron mediante CLI. El detalle de verificación está en el documento de estado.

## Secuencia

1. Ejecutar build backend, comprobación EF, build/lint frontend, `node tests/api-smoke.mjs`, Docker build y `node tests/docker-smoke.mjs`.
2. Configurar `scripts/azure/config.local.ps1` desde el ejemplo; no incluir credenciales. Los comandos usan la suscripción explícita.
3. Revisar `provision.ps1` sin `-Execute`; con autorización, ejecutar `-Execute`. Verifica capacidades, cuota y flags Free efectivos. Crea/reutiliza recursos sin tocar PostgreSQL.
4. `migrate.ps1 -Execute -InitialEmptyCheck -ClientIp <IPv4-individual>`: agrega solo esa IP temporal, migra, verifica cero actividades/mediciones y prepara usuario contenido trazo_app. Retira la regla en finally, incluso ante errores. No copiar datos locales.
5. `scripts/New-AuthSecret.ps1` configura el hash de contraseña personal en el entorno; `build-and-deploy.ps1 -Execute` compila, publica imagen y configura secrets de Container Apps. Conexión SQL y hash nunca se guardan en el repositorio ni imagen.
6. El firewall SQL permite únicamente las IPs de salida publicadas de Container Apps. No se habilita la regla 0.0.0.0 de acceso general desde Azure. Si cambian las IPs, ejecutar `status.ps1 -SyncFirewall` después de revisar el cambio de red.
7. `status.ps1` comprueba recursos, probes y API anónima. Completar pruebas autenticadas y observar tanto scale-to-zero como SQL Paused→Online antes de dar por verificado el deployment.

Production no migra ni ejecuta seed al iniciar. Flags `Database__Initialize=false`, `Database__SeedDemo=false`. Probes live/ready no consultan SQL. Pooling desactivado y reintentos transitorios permiten pausa y reanudación; una carga inicial puede tardar alrededor de un minuto o más. Medirlo en la verificación real.

TLS de SQL valida el certificado, mínimo TLS1.2. `trazo_app` solo tiene CONNECT/CRUD dbo; la cuenta admin se usa para migraciones. DP keys viven en SQL, no en disco efímero. La app usa cookies HttpOnly/Secure/Strict y CSRF; no hay usuarios/OAuth.

## Costos y conservación

SQL Free incluye 100.000 vCore-seconds mensuales, 32 GB datos y 32 GB backup. Con AutoPause al agotar cuota, se suspende hasta el mes siguiente sin autorizar exceso facturable. La espera de inactividad consume cuota mientras sigue online; no asumir que cada sesión cuesta solo lo que tarda el usuario en hacer consultas. ACR Basic sigue siendo un costo fijo aproximado de USD 5/mes; Container Apps y transferencia dependen del uso. PostgreSQL temporal conserva su costo aproximado de USD 18/mes mientras no se elimine. No se agregan Log Analytics, Blob, Key Vault ni red premium.

No ejecutar destroy ni eliminar/detener PostgreSQL. Su eliminación necesita una instrucción posterior y solo debe proponerse tras todas las comprobaciones Production. No configurar dominio personalizado todavía.

Fuentes: [oferta Free](https://learn.microsoft.com/azure/azure-sql/database/free-offer), [Serverless/defaults](https://learn.microsoft.com/azure/azure-sql/database/serverless-tier-overview).
