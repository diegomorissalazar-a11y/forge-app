# MELQART v124 — Paleta fenicia unificada + Progreso/Medidas sándwich

## Cambios

### 1. Paleta fenicia unificada (styles.css)
- Tokens centralizados: `--p` (púrpura #6B3FA0), `--acc` (oro #C49A30), `--teal` (turquesa #2BA8AA), `--ok` (verde olivo), `--warn` (terracota)
- Aliases `--orange`, `--bronze`, `--gold`, `--blue`, `--green`, `--red` redirigen a tokens fenicicos
- Botones, tabs, gráficos, badges, inputs, nav: todos con paleta fenicia
- Dark mode completo con tokens ajustados

### 2. Fuente única Montserrat + tabular nums
- `*` global usa Montserrat — elimina cualquier Cinzel residual en la UI
- `font-variant-numeric: tabular-nums` global para números consistentes

### 3. Labels e íconos
- "Estadísticas" → "Progreso" en nav y topbar
- Ícono "Entrenar" → SVG dumbbell (pesa) limpio, sin emoji

### 4. Progreso — sándwich accordion
- Agrupación: Tren Inferior / Tren Superior / Correr (por nombre/muscle)
- Cada ejercicio: cabecera con nombre (izq) + PDR (der) + chevron
- Al expandir: KPIs (PDR, progresión, sesiones) + segmentadores 1M/3M/6M/12M/Todo + gráfico genérico
- Cardio: gráfico distancia + gráfico ritmo (eje Y invertido)

### 5. Mediciones Corporales — sándwich accordion
- Secciones: Resumen corporal / Composición / Pliegues
- IMC calculado automáticamente si hay estatura en perfil
- Badge de categoría IMC (Bajo peso / Normal / Sobrepeso / Obesidad)
- Cada métrica expandible con KPIs + segmentadores + gráfico dinámico
- Sin tablas — solo gráficos y filas de datos limpias

### 6. Sin cambios en
- Firebase / Auth, lógica de guardado, Nutrición, Agua, Sesiones, overlay detalle ejercicio
