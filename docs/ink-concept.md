# Estudio local 01: tinta

Prototipo visual del 12-11-2026 en la rama `codex/ink-detail-concept`. No desplegado. Reutiliza el detalle de actividad real con una actividad ficticia; no lee producción y rechaza escrituras. La sesión simulada existe solo en la entrada aislada `frontend/concept.html`, protegida por `import.meta.env.DEV`; la entrada normal mantiene su autenticación. El build normal no incluye el HTML del concepto.

Desde la raíz, iniciar `npm --prefix frontend run dev` y abrir http://127.0.0.1:5173/concept.html. Para volver al concepto después de navegar o recargar, abrir esa URL nuevamente. Solo está implementado el detalle de la actividad de ejemplo; los enlaces a otras pantallas no forman parte de esta prueba.

El fondo combina curvas SVG, capas difusas y movimiento lento mediante CSS; no usa GIF, video ni servicios externos. Respeta `prefers-reduced-motion`. Sus estilos se cargan exclusivamente en la entrada del concepto. El ajuste de padding del botón usa una clase específica del detalle: alineado a la derecha en escritorio y ancho completo bajo 700 px.

Verificado: build y lint, portapapeles real en Edge headless y ausencia de overflow horizontal a 1440, 390 y 320 px. Capturas locales en `artifacts/ink-concept-*.png` (no incluidas en Git). La comprobación móvil corresponde a tamaños de viewport, no a una prueba en teléfono físico.


## Estudio 02: Ritmo

Abrir http://127.0.0.1:5173/concept-rhythm.html. Conserva la paleta oscura e introduce curvas de pista con un destello en movimiento, anillos de expansión/contracción cada ocho segundos y luz ambiental. Es animación decorativa: no representa pulsaciones ni respiración medidas. El selector inferior permite comparar Tinta y Ritmo. Ambas variantes comparten la actividad ficticia, bloquean escrituras y permanecen fuera del build normal.

Verificado en Edge headless a 1440, 390 y 320 px: sin overflow horizontal ni errores de página, portapapeles, cambio entre propuestas, transformación animada de anillos y detención con `prefers-reduced-motion`. Build y lint correctos. Capturas locales en `artifacts/rhythm-*.png`.
