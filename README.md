# MELQART v180 — gráficos progreso + Hevy histórico

Cambios:
- Se agregan registros históricos Hevy enero–marzo 2026.
- Se fusionan sesiones del mismo día para evitar duplicados.
- Se normaliza `Hiptrust máquina` / variantes a un único ejercicio: `Hip Thrust (Máquina)`.
- Se corrige adherencia nutricional para que el aceite no castigue.
- Creatina en recuperación se expresa en porcentaje.
- Semana en curso en recuperación usa solo días transcurridos.
- Gráficos genéricos de progreso incorporan eje Y visible, tooltip hover/click y línea de tendencia lineal.
- Ritmo mantiene escala normal: valor mayor arriba, menor abajo.

Validación técnica:
- node --check app.js
