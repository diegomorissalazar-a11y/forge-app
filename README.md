# MELQART v192 — Seguridad: no ocultar jueves

Corrige el riesgo detectado antes de cargar v191:
- No filtra ni oculta rutinas de jueves.
- No elimina sesiones ni registros.
- Si hay más de una rutina de trote/carrera el mismo día, muestra la primera como plan de carrera y las otras como "Carrera histórica".
- Jueves Noche — Trote no se marca como Plan fuerza.
- Mantiene v189/v190: importador/editor de duración de trote corregido e integración visual del plan.

Validar en consola:
mq192DiagnosticoRutinas()

Validar visual:
- Entrenar debe conservar todas las rutinas.
- Ninguna rutina de trote debe decir Plan fuerza.
- Si existe una segunda rutina de jueves, no se oculta.
