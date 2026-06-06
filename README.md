# MELQART v176 — Heatmaps + Recuperación

## Cambios aplicados

- Corrige heatmaps para el año 2026:
  - Días entrenados: blanco sin entrenamiento, morado suave con 1 entrenamiento, morado intenso con 2+ entrenamientos.
  - Pauta alimenticia: marca solo días con pauta completa.
  - Proteína: marca días con meta diaria de proteína cumplida.
  - Agua: marca días con 10 vasos / meta diaria cumplida.
  - Creatina: agrega heatmap con consumo completo desde 12-12-2024, excepto 07-03-2026, 08-03-2026, 09-05-2026 y 10-05-2026.
- Ajusta el ancho visual de los heatmaps para que no queden comprimidos.
- Agrega tab `Recuperación` dentro de Progreso.
- Agrega 5 KPIs superiores:
  - Sueño
  - Creatina
  - Proteína
  - Agua
  - Cumplimiento general
- Agrega gráficos semanales estilo plan:
  - Sueño promedio semanal
  - Creatina días / 7
  - Proteína % cumplimiento semanal
  - Agua vasos promedio / 10
  - Cumplimiento general semanal

## Reglas de cálculo

- Heatmaps: diarios.
- Recuperación: semanal.
- Cumplimiento general: promedio simple de sueño, creatina, proteína y agua; cada uno pondera 25%.
- Sueño objetivo: 7 horas promedio.
- Creatina objetivo: 7/7 días.
- Proteína objetivo: 100% de la meta diaria.
- Agua objetivo: 10 vasos promedio.

## No modificado

- Home
- Entrenar
- Nutrición registro
- Peso semanal
- Antropometría
- Login
- Firebase/Auth
- Logo
- Colores globales
- Tipografías

## Validación

- `node --check app.js` OK
