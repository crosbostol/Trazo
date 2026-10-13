# Prueba asistida de login — 24-09-2026

Ejecutada con navegador integrado y una base local desechable, sin tocar progress.
No es una dependencia E2E ni se ejecuta como parte del smoke automático.

1. Abrir `/` sin sesión: redirige a `/login`; no se presenta el dashboard.
2. Ingresar la contraseña temporal de la prueba: muestra dashboard y botón Salir.
3. Recargar: mantiene sesión y carga métricas desde la API autenticada.
4. Pulsar Cerrar sesión: vuelve a `/login`.

Resultado: todos los pasos comprobados. El token CSRF se renueva al entrar/salir;
ninguna credencial ni cookie se guarda en localStorage.

Las pruebas automáticas complementarias están en `auth-client.mjs` (401, login,
logout, CSRF y rate limit) y `docker-smoke.mjs` (Production, flags Secure, clave
persistida entre reinicios, cookies manipuladas y rotación de contraseña).
