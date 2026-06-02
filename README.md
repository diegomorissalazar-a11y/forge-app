# MELQART v168 — Home Agua + Creatina compacta y Sueño noche anterior

## Cambios
- Home: Nutrición queda arriba; debajo se muestra una fila compacta Agua (75%) + Creatina (25%).
- Agua mantiene 10 vasos visibles y clickeables.
- Creatina queda compacta con ícono + estado corto y KPI semanal.
- Sueño queda debajo de Agua + Creatina.
- Sueño desde Home registra siempre la noche anterior: si se registra hoy, se guarda en la fecha de ayer.
- El promedio de sueño de 7 días usa la fecha real del sueño.
- El exportador mantiene el dato de sueño asociado a la fecha real guardada.

## Validación
- `node --check app.js` ejecutado correctamente.
- No se modificó Entrenar, beep, unilaterales, Peso, Progreso, Login, Firebase/Auth, Exportar, logo, colores globales ni tipografías.

## Archivos
- index.html
- styles.css
- app.js
- assets/
