# MELQART v198 — Ciclo 2 depurado

## Correcciones

- Versión coherente en pestaña, menú y consola: `v198`.
- `app.js?v=198` y `styles.css?v=198` para evitar archivos antiguos en caché.
- Inicio fijo del Ciclo 2: **20-07-2026**.
- Reaplicación segura del plan después de cargar datos desde la nube.
- Cuatro ejercicios como máximo en cada sesión de fuerza.
- Objetivos del IRF corregidos: 8 dominadas libres y 12 fondos libres.
- Dominadas y fondos asistidos no se cuentan como repeticiones libres.
- Los componentes del IRF sin información muestran “Sin datos” y no reciben 50 puntos ficticios.
- Se conserva íntegramente el historial.

## Distribución

- Lunes: Tren Inferior A.
- Martes: Tren Superior A.
- Miércoles: Carrera de Calidad.
- Jueves almuerzo: Tren Inferior B.
- Jueves noche: Rodaje Regenerativo.
- Viernes: Tren Superior B.
- Domingo: Fondo Largo.

## Validación en consola

```js
window.MELQART_VERSION
mq198Diagnostico()
```
