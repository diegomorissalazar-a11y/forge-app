# MELQART v170 · Alerta visual y vibración en descanso

Cambios:
- Agrega vibración fuerte en los últimos 5 segundos del descanso.
- Agrega pulso visual del overlay de descanso cuando quedan 5 segundos o menos.
- Mantiene beep existente, pero suma respaldo táctil/visual para casos con YouTube o música activa.
- No cambia lógica de guardado de entrenamiento ni otros módulos.

Validación técnica:
- `node --check app.js` OK.

No tocado:
- Home, Nutrición, Peso, Progreso, Login, Firebase/Auth, Exportar, gráficos, logo, colores globales y tipografías.
