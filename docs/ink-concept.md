# Estudio local 01: tinta

Prototipo visual del 12-11-2026 en la rama `codex/ink-detail-concept`. Los estudios originales permanecen disponibles localmente; Ritmo se integró después en la aplicación para su despliegue autorizado. Reutiliza el detalle de actividad real con una actividad ficticia; no lee producción y rechaza escrituras. La sesión simulada existe solo en la entrada aislada `frontend/concept.html`, protegida por `import.meta.env.DEV`; la entrada normal mantiene su autenticación. El build normal no incluye el HTML del concepto.

Desde la raíz, iniciar `npm --prefix frontend run dev` y abrir http://127.0.0.1:5173/concept.html. Para volver al concepto después de navegar o recargar, abrir esa URL nuevamente. Solo está implementado el detalle de la actividad de ejemplo; los enlaces a otras pantallas no forman parte de esta prueba.

El fondo combina curvas SVG, capas difusas y movimiento lento mediante CSS; no usa GIF, video ni servicios externos. Respeta `prefers-reduced-motion`. Sus estilos se cargan exclusivamente en la entrada del concepto. El ajuste de padding del botón usa una clase específica del detalle: alineado a la derecha en escritorio y ancho completo bajo 700 px.

Verificado: build y lint, portapapeles real en Edge headless y ausencia de overflow horizontal a 1440, 390 y 320 px. Capturas locales en `artifacts/ink-concept-*.png` (no incluidas en Git). La comprobación móvil corresponde a tamaños de viewport, no a una prueba en teléfono físico.


## Estudio 02: Ritmo

Abrir http://127.0.0.1:5173/concept-rhythm.html. Conserva la paleta oscura e introduce curvas de pista con un destello en movimiento, anillos de expansión/contracción cada ocho segundos y luz ambiental. Es animación decorativa: no representa pulsaciones ni respiración medidas. El selector inferior permite comparar Tinta y Ritmo. Ambas variantes comparten la actividad ficticia, bloquean escrituras y permanecen fuera del build normal.

Verificado en Edge headless a 1440, 390 y 320 px: sin overflow horizontal ni errores de página, portapapeles, cambio entre propuestas, transformación animada de anillos y detención con `prefers-reduced-motion`. Build y lint correctos. Capturas locales en `artifacts/rhythm-*.png`.


## Integración en la aplicación

Aprobado Ritmo para producción el 12-11-2026. `RhythmBackdrop.tsx` y `rhythm.css` contienen el fondo y el estilo de la aplicación; `index.css` define la paleta oscura. No importan la entrada `concept.tsx` ni su simulación de datos/sesión. El fondo se monta dentro del área autenticada, es decorativo, no recibe eventos y respeta movimiento reducido. El texto ambiental se limita al detalle para no ocupar el espacio de acciones de otras pantallas.

Verificación del build de producción antes del despliegue: siete pantallas (detalle, resumen, listado, importar, nuevo registro, cuerpo y progreso) a 1440/390/320 px sin overflow horizontal ni errores JavaScript; padding del botón, copia exacta de payload, movimiento reducido y pantalla de login sin sesión. Datos simulados únicamente mediante interceptación del navegador de pruebas. Se comprobó que los bundles no incluyen la simulación local. Estado efectivo y digest en [producción](near-zero-deployment.md).


Ritmo se desplegó el 12-11-2026 desde `5ec65c21a609afecef6f6f388bdd07bc6ed94467`, revisión `trazo-mvp--0000001`, con la imagen y verificaciones registradas en la guía de producción.
