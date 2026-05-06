# MELQART v115 — Weight Card + Water + Login Patch

Base: v110/v108 functional app. This release is a targeted patch, not a full redesign.

## Included changes

### Weight card
- Uses the last 7 real body weight measurements from `forge.bodyMetrics`.
- Removes weekday/date labels under the sparkline.
- Keeps `+ Peso` and objective edit action.
- Removes the candle/icon from the circular progress ring.
- Shows a larger, cleaner percentage inside the ring.

### Water card
- Fixes `+250 ml`, `+500 ml`, `+750 ml` actions.
- Synchronizes `aguaMl`, visual amphora count, and nutrition state.
- Keeps total water goal at 2.5 L.
- Prevents the green toast/block from visually covering the interface as a solid green action bar.

### Login
- Primary login button, active tab, and input focus use Fenician purple.
- No Firebase/Auth logic changed.

## Protected logic
- Firebase/Auth untouched.
- Local storage structure preserved.
- Training sessions and export logic preserved.
- Nutrition/meal logic preserved except for water-state synchronization.

## Upload instructions
Upload the full ZIP content to GitHub root:

```text
index.html
styles.css
app.js
README.md
assets/
```


## v118 Progress Dashboard
- Rediseña Progreso > Ejercicios con filtro global: Todo, 1 mes, 4 meses, 6 meses, 12 meses.
- Categorías cerradas por defecto: Tren inferior, Tren superior, Carrera / trote, Otros.
- Cada categoría muestra cantidad de ejercicios con registros.
- Al expandir, muestra tarjetas con gráfico por ejercicio.
- Fuerza grafica peso máximo por sesión.
- Carrera/trote grafica ritmo.
- PR destacado con punto púrpura profundo.
- Tooltip tap/hover con KPI y fecha dd-mm-yyyy.
- Eje dinámico con margen 20% y margen mínimo visual.
- Medidas corporales agrega acordeón con Peso, Grasa e IMC.
- No toca Firebase/Auth, Home, Nutrición, Agua, Exportar ni Entrenar.
