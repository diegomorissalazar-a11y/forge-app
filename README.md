# MELQART 2.1.0 — arquitectura y recomendación de fuerza

Base auditada: **MELQART 2.0.3**.

## Cambios

- Motor de recomendación de fuerza por ejercicio exacto/variante.
- Principio: **REPS → CONSOLIDACIÓN → CARGA**.
- Ventana preferida: últimas 3–5 exposiciones; contexto hasta 8.
- Estados: subir reps, subir carga, mantener/repetir, reducir y reentrada.
- Reentrada conservadora tras interrupciones >14–21 días.
- Botón **Recomendación de hoy** en las 4 rutinas de fuerza y en Inicio cuando corresponde.
- **Iniciar con recomendación** precarga series, peso/carga externa y reps sin marcarlas como realizadas.
- Dominadas/Fondos conservan carga externa: negativa=asistencia, 0=libre, positiva=lastre.
- Taxonomía canónica de ejercicios (movimiento, familia, equipo, clase y métrica) sin destruir IDs históricos.
- Diccionario canónico de variables/unidades.
- Tipos de sesión normalizados para Ciclo 2.
- Persistencia de sesión activa en localStorage cada 15 s y en cambios de visibilidad/pagehide.
- Una sola versión final visible: `2.1.0` en navegador, menú y consola.
- Auditoría runtime: `mq210Audit()`.

## Diagnóstico

```js
window.MELQART_VERSION
window.MELQART_BUILD
mq210Audit()
mq210EvaluateRoutine('r_lunes')
mq210EvaluateExercise('ex_press_banca', forge.routines.find(r=>r.id==='r_martes'))
```
