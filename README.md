# MELQART v123 — Sistema genérico de gráficos

## Cambios respecto a v122

### Nuevo: Sistema de gráficos `renderMetricChart(config)`

Componente genérico SVG vanilla JS que reemplaza las funciones aisladas anteriores
(`renderLineChartTall`, `renderLineChartFull`, `renderLineChartRitmoTall`).

**Helpers nuevos:**
- `paceToDecimal(pace)` — convierte "6:54" → 6.9
- `decimalToPace(value)` — convierte 6.9 → "6:54"
- `detectSmith(value, equipment)` — detecta máquina Smith (peso termina en .9)
- `calculateVolume(weight, reps, sets)` — peso × reps × series
- `formatMetricValue(value, type, unit)` — formatea según tipo
- `formatAxisTick(value, type, unit)` — formatea tick del eje Y
- `calculateYAxisDomain(values, options)` — dominio Y con padding dinámico
- `applyTimeFilter(data, range)` — filtra por 7d / 30d / 3m / 6m / 12m / all / año

**Generadores de configuración:**
- `createExerciseWeightChart(name, sessions, id)` — carga máxima por ejercicio
- `createExerciseVolumeChart(name, sessions, id)` — volumen por ejercicio
- `createBodyMeasureChart(measureId, name, measurements)` — medida corporal
- `createBodyWeightChart(measurements)` — peso corporal
- `createPaceChart(sessions)` — ritmo de carrera
- `createDistanceChart(sessions)` — distancia de carrera

**Helpers de agrupación:**
- `groupByWeek(data)` — agrupa puntos por semana (lunes)
- `groupByMonth(data)` — agrupa por mes

**Integradores:**
- `buildExDetailCharts(puntos, isRun, exId, filtroSel)` — sustituye gráficos en detalle de ejercicio
- `buildCuerpoChartHtml(pts, metricKey, unit, color, filtroSel)` — sustituye gráfico en overlay corporal

**Tooltip global:**
- `mqChartTooltipShow(evt, date, main, sub)` / `mqChartTooltipHide()`

### Estilos nuevos (styles.css)
Clases `.mq-chart-card`, `.mq-chart-header`, `.mq-chart-filters`, `.mq-chart-empty`,
`.mq-chart-tooltip`, `.mq-chart-smith-badge`

## No tocado
- Firebase / Auth
- Lógica de guardado
- Nutrición / Agua
- Sesiones / Entrenar
- Navegación
- Tab Fotos / Plan
