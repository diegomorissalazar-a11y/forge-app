# MELQART v188 — Fix importador carrera y métricas limpias

- `duration: "01:19:36"` se guarda como `time: "79:36"`.
- Conserva `durationRaw`, `durationHHMMSS` y `durationSeconds`.
- Excluye de métricas del plan trotes con ritmo sospechoso (<4:00/km o >13:30/km).
- Funciones: `importRunJson`, `mq188RunningMetrics`, `mq188RepairExistingRunDurations`.
