# Comprobación de UI de importación

Ejecutada con el navegador integrado el 23 de septiembre de 2026, contra una
base PostgreSQL desechable `progress_test_1790088098033`, sin modificar `progress`.
No requiere instalar una librería E2E. Esta es una prueba de aceptación asistida
por navegador, no un test de navegador ejecutado por `api-smoke.mjs`.

Para repetir, conecta la API local a una base de pruebas vacía, con seed apagado,
y abre el frontend. Usa la fecha actual de Santiago en el JSON:

```json
{
  "date": "2026-09-23",
  "type": "Running",
  "durationSeconds": 1800,
  "notes": "Prueba UI importación aislada",
  "running": {
    "distanceKm": 5,
    "averagePaceSecondsPerKm": 360,
    "averageHeartRate": 145,
    "maxHeartRate": 170,
    "aerobicTrainingEffect": 3.2
  },
  "rawPayload": { "id": 9007199254740993, "big": 1e400 }
}
```

1. Navegación → Importar. Pegar JSON y pulsar Validar.
   **Verificado:** preview con fecha, 30:00 min, 5 km, 6:00/km, FC 145/170,
   Training Effect 3,2; ausencia de métricas opcionales indicada con `—`.
2. Elegir Mood 4, Energy 3, RPE 6 y escribir notas subjetivas. Formatear JSON.
   **Verificado:** descripciones legibles, JSON actualizado; tokens
   `9007199254740993` y `1e400` intactos.
3. Pulsar Importar actividad.
   **Verificado:** aparece confirmación y destino; `GET /api/activities` sigue
   devolviendo `[]` antes de Confirmar y guardar.
4. Confirmar y guardar.
   **Verificado:** se abre el detalle con métricas y sensaciones. Ir a Actividades
   muestra inmediatamente la fila nueva. Resumen muestra 1 sesión, 5 km semanales,
   6:00/km, FC 145, última actividad y puntos de los gráficos.
5. Regresar a Importar, pegar el ejemplo Strength del README y validar.
   **Verificado:** preview de Fuerza, ejercicios y cantidad de sets.
6. Probar a 390×844.
   **Verificado:** navegación inferior con cuatro accesos, textarea, preview,
   selects y confirmación utilizables; ancho del contenido igual al viewport,
   sin desplazamiento horizontal de la página. Restaurar viewport al finalizar.
7. Sustituir el texto por `{invalid` y pulsar Validar.
   **Verificado:** mensaje de sintaxis en español; desaparece la vista previa
   y no hay botón de importación para contenido inválido.

Los tests automáticos de `import-checks.mjs`, invocados desde `api-smoke.mjs`,
cubren además Strength efectivo, nulls, dominio inválido, JSONB no representable,
precisión después de leer, actualización de series y eliminación con cascadas.
La confirmación de eliminación existente no se modificó.
