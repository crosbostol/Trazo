# Frontend de Trazo

React + TypeScript + Vite. Sigue el [README principal](../README.md) para iniciar SQL Server local, la API y la autenticación. Producción usa Cosmos; el frontend conserva los mismos contratos JSON de importación.

Desde la raíz del repositorio:

```powershell
npm --prefix frontend ci
npm --prefix frontend run dev
```

Abre http://127.0.0.1:5173 con la API en http://127.0.0.1:5143. Vite reenvía `/api`; usa el mismo hostname para la cookie de sesión. Las escrituras requieren sesión y token CSRF, gestionados por el cliente HTTP.

```powershell
npm --prefix frontend run build
npm --prefix frontend run lint
```

El Dockerfile incorpora `dist` y ASP.NET sirve frontend y API desde el mismo origen. GitHub Actions verifica y publica la imagen en GHCR; el despliegue es una operación separada. Consulta el [estado de producción](../docs/near-zero-deployment.md) y las [pruebas de importación](../tests/import-ui.md).
