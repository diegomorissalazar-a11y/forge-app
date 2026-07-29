# MELQART 2.0.0

## Cambio principal

- La tarjeta **Miércoles — Carrera de Calidad** incorpora **Cargar datos**.
- Importa JSON de carrera con fecha, duración, distancia, FC, ritmo, cadencia, calorías, pasos e intervalos.
- Guarda el bloque `intervalos` completo en localStorage, Firebase, respaldo y objeto de sesión.
- Bloquea duplicados por fecha + tipo + duración + distancia.
- Mantiene compatibilidad con sesiones antiguas y con los otros cargadores de running.

## Diagnóstico en consola

```js
window.MELQART_VERSION
mq200Diagnostico()
```

## Prueba

La ventana de carga viene precargada con el JSON funcional de Carrera de Calidad para facilitar la validación.
