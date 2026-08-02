# MELQART 2.0.2 — Carga externa en fuerza relativa

## Cambio principal

Dominadas y Fondos en paralelas usan una única métrica continua: **carga externa**.

- Valor negativo: asistencia (`-27 kg`).
- Cero: peso corporal libre (`0 kg`).
- Valor positivo: lastre (`+5 kg`).
- Carga efectiva calculada: `peso corporal + carga externa`.
- El peso corporal queda congelado dentro de cada sesión.
- Desde la sesión se puede usar el último peso disponible o registrar/actualizar el peso del día.
- El historial y exportable muestran repeticiones, carga externa, peso corporal y carga efectiva.
- Las antiguas variantes “Dominadas Asistidas” y “Fondos Asistidos” se migran al ejercicio canónico para conservar una serie histórica continua.

## Compatibilidad

Mantiene los cambios de MELQART 2.0.1:

- JSON estructurado para Carrera de Calidad, Rodaje Regenerativo y Fondo Largo.
- Intervalos y parciales por kilómetro.
- Persistencia local, Firebase y respaldo mediante el modelo existente.

## Diagnóstico en consola

```js
window.MELQART_VERSION
mq202Diagnostico()
```
